import os
import time
from cassandra.cluster import Cluster
from cassandra.policies import RoundRobinPolicy

# ── Configuration via environment variable ───────────────────────────────
CASSANDRA_HOST = os.getenv("CASSANDRA_HOST", "127.0.0.1")

cluster = None
session = None


def connect(retries: int = 10, delay: int = 10):
    """
    Connects to Cassandra with retry mechanism.
    Uses CASSANDRA_HOST variable (default: 127.0.0.1 for local dev,
    override with Docker DNS name in production).
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
            print(f"✅ Connected to Cassandra on {CASSANDRA_HOST}!")
            return
        except Exception as e:
            print(f"⏳ Attempt {attempt}/{retries} — unable to reach Cassandra ({e})")
            if attempt < retries:
                time.sleep(delay)
    raise RuntimeError(
        f"❌ Unable to connect to Cassandra after {retries} attempts."
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


# ── Change keyspace strategy ────────────────────────────────────────

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


# ── Cluster helpers ──────────────────────────────────────────────────────────

def get_nodes_info():
    nodes = []
    for host in cluster.metadata.all_hosts():
        nodes.append({
            "address":    str(host.address),
            "datacenter": host.datacenter,
            "rack":       host.rack,
            "is_up":      host.is_up  # actual state reported by driver
        })
    return nodes


def get_datacenters() -> dict:
    """Returns {dc_name: [address, ...]} for all DCs in the cluster."""
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