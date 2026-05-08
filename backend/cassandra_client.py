import os
import time
from cassandra.cluster import Cluster
from cassandra.policies import RoundRobinPolicy

# ── Configuration via variable d'environnement ───────────────────────────────
CASSANDRA_HOST = os.getenv("CASSANDRA_HOST", "127.0.0.1")

cluster = None
session = None


def connect(retries: int = 10, delay: int = 10):
    """
    Se connecte à Cassandra avec mécanisme de retry.
    Utilise la variable CASSANDRA_HOST (défaut: 127.0.0.1 pour dev local,
    à surcharger avec le nom DNS Docker en production).
    """
    global cluster, session
    for attempt in range(1, retries + 1):
        try:
            cluster = Cluster(
                contact_points=[CASSANDRA_HOST],
                port=9042,
                load_balancing_policy=RoundRobinPolicy(),
                protocol_version=4
            )
            session = cluster.connect()
            _setup_keyspace_simple(3)
            print(f"✅ Connecté à Cassandra sur {CASSANDRA_HOST} !")
            return
        except Exception as e:
            print(f"⏳ Tentative {attempt}/{retries} — impossible de joindre Cassandra ({e})")
            if attempt < retries:
                time.sleep(delay)
    raise RuntimeError(
        f"❌ Impossible de se connecter à Cassandra après {retries} tentatives."
    )


def _setup_table():
    session.set_keyspace("simcassandra")
    session.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            name    TEXT,
            email   TEXT
        )
    """)


def _setup_keyspace_simple(rf: int):
    session.execute(f"""
        CREATE KEYSPACE IF NOT EXISTS simcassandra
        WITH replication = {{
            'class': 'SimpleStrategy',
            'replication_factor': {rf}
        }}
    """)
    _setup_table()


# ── Changer la stratégie du keyspace ────────────────────────────────────────

def alter_strategy_simple(rf: int):
    session.execute(f"""
        ALTER KEYSPACE simcassandra
        WITH replication = {{
            'class': 'SimpleStrategy',
            'replication_factor': {rf}
        }}
    """)


def alter_strategy_nts(dc_options: dict):
    """dc_options = {'dc1': 3, 'dc2': 3}"""
    dc_str = ", ".join([f"'{k}': {v}" for k, v in dc_options.items()])
    session.execute(f"""
        ALTER KEYSPACE simcassandra
        WITH replication = {{
            'class': 'NetworkTopologyStrategy',
            {dc_str}
        }}
    """)


# ── Helpers cluster ──────────────────────────────────────────────────────────

def get_nodes_info():
    nodes = []
    for host in cluster.metadata.all_hosts():
        nodes.append({
            "address":    str(host.address),
            "datacenter": host.datacenter,
            "rack":       host.rack,
            "is_up":      host.is_up  # état réel rapporté par le driver
        })
    return nodes


def get_datacenters() -> dict:
    """Retourne {dc_name: [adresse, ...]} pour tous les DCs du cluster."""
    dcs: dict = {}
    for host in cluster.metadata.all_hosts():
        dc = host.datacenter
        if dc not in dcs:
            dcs[dc] = []
        dcs[dc].append(str(host.address))
    return dcs


def get_session():
    return session


def get_cluster():
    return cluster