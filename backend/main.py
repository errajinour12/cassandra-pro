import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from cassandra_client import connect, get_session, get_cluster

# ── CORS — allowed origins via environment variable ──────────────────
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ── Lifespan (replaces @app.on_event("startup"), deprecated since FastAPI 0.93)
@asynccontextmanager
async def lifespan(app: FastAPI):
    connect()          # startup: Cassandra connection with retry
    yield
    # (optional) cluster.shutdown() here if cleanup is needed


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "SimCassandra backend running"}


# ── Cluster ──────────────────────────────────────────────────────────────────

@app.get("/cluster/nodes")
def get_nodes():
    from cassandra_client import get_nodes_info
    return {"nodes": get_nodes_info()}


@app.get("/cluster/tokens")
def get_tokens():
    cluster = get_cluster()
    result = []
    for host in cluster.metadata.all_hosts():
        tokens = [
            str(t.value)
            for t in sorted(cluster.metadata.token_map.token_to_host_owner.keys())
            if cluster.metadata.token_map.token_to_host_owner[t] == host
        ]
        result.append({
            "address":    str(host.address),
            "datacenter": host.datacenter,
            "rack":       host.rack,
            "is_up":      host.is_up,
            "tokens":     tokens
        })
    return {"nodes": result}


@app.get("/cluster/datacenters")
def get_datacenters():
    from cassandra_client import get_datacenters as _gd
    return {"datacenters": _gd()}


class StrategyConfig(BaseModel):
    strategy: str           # "simple" | "nts"
    replication_factor: int = 3
    dc_options: dict = {}   # {"dc1": 3, "dc2": 3}  — NTS only


@app.post("/cluster/strategy")
def change_strategy(config: StrategyConfig):
    from cassandra_client import alter_strategy_simple, alter_strategy_nts, get_session
    if config.strategy == "simple":
        alter_strategy_simple(config.replication_factor)
        label = f"SimpleStrategy (RF={config.replication_factor})"
    else:
        if not config.dc_options:
            raise HTTPException(status_code=400, detail="dc_options is required for NetworkTopologyStrategy")
        alter_strategy_nts(config.dc_options)
        dc_detail = ", ".join([f"{k}={v}" for k, v in config.dc_options.items()])
        label = f"NetworkTopologyStrategy ({dc_detail})"

    # Reset data to avoid mixing simulations
    session = get_session()
    session.execute("TRUNCATE users")

    return {"message": f"Strategy changed to {label}. Data has been reset."}


# ── Data ──────────────────────────────────────────────────────────────────

@app.get("/data/all")
def get_all_users():
    session = get_session()
    rows = session.execute("SELECT token(user_id), user_id, name, email FROM users")
    return {"users": [
        {"token": str(r[0]), "user_id": r.user_id, "name": r.name, "email": r.email}
        for r in rows
    ]}


# ── Models for JSON body requests ──────────────────────────────────────

class UserInsert(BaseModel):
    user_id: str
    name: str
    email: str = ""


class UserUpdate(BaseModel):
    name: str = None
    email: str = None


@app.post("/data/insert")
def insert_user(user: UserInsert):
    session = get_session()
    user_id = user.user_id
    name = user.name
    email = user.email or f"{user_id}@example.com"

    # ── Duplicate check ──
    existing = session.execute(
        "SELECT user_id FROM users WHERE user_id = %s", (user_id,)
    ).one()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"The ID '{user_id}' already exists in the database. Choose another ID or use the Update function."
        )

    session.execute(
        "INSERT INTO users (user_id, name, email) VALUES (%s, %s, %s)",
        (user_id, name, email)
    )
    row = session.execute(
        "SELECT token(user_id) FROM users WHERE user_id = %s", (user_id,)
    ).one()
    return {"user_id": user_id, "token": str(row[0]), "message": "Inserted successfully"}


@app.put("/data/update/{user_id}")
def update_user(user_id: str, body: UserUpdate):
    session = get_session()
    existing = session.execute(
        "SELECT user_id, name, email FROM users WHERE user_id = %s", (user_id,)
    ).one()
    if not existing:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' does not exist.")

    new_name  = body.name  if body.name  else existing.name
    new_email = body.email if body.email else existing.email

    session.execute(
        "UPDATE users SET name = %s, email = %s WHERE user_id = %s",
        (new_name, new_email, user_id)
    )
    return {"user_id": user_id, "name": new_name, "email": new_email, "message": "Updated successfully"}


@app.delete("/data/delete/{user_id}")
def delete_user(user_id: str):
    session = get_session()
    existing = session.execute(
        "SELECT user_id FROM users WHERE user_id = %s", (user_id,)
    ).one()
    if not existing:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' does not exist.")

    session.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
    return {"message": f"'{user_id}' deleted successfully"}


@app.get("/data/partition/{user_id}")
def get_partition_info(user_id: str):
    session = get_session()
    row = session.execute(
        "SELECT token(user_id), user_id, name, email FROM users WHERE user_id = %s",
        (user_id,)
    ).one()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": row.user_id, "name": row.name, "email": row.email, "token": str(row[0])}