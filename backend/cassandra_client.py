from cassandra.cluster import Cluster
from cassandra.policies import RoundRobinPolicy

cluster = None
session = None


def connect():
    global cluster, session
    cluster = Cluster(
        contact_points=["127.0.0.1"],
        port=9042,
        load_balancing_policy=RoundRobinPolicy(),
        protocol_version=4
    )
    session = cluster.connect()
    _setup_keyspace_simple(3)
    print("Connecté à Cassandra !")


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
            "is_up":      True   # forcé True (driver hors Docker ne voit pas les IPs internes)
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