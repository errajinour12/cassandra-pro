from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from cassandra_client import connect, get_session, get_cluster

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    connect()


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
            "is_up":      True,
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
    dc_options: dict = {}   # {"dc1": 3, "dc2": 3}  — NTS uniquement


@app.post("/cluster/strategy")
def change_strategy(config: StrategyConfig):
    from cassandra_client import alter_strategy_simple, alter_strategy_nts, get_session
    if config.strategy == "simple":
        alter_strategy_simple(config.replication_factor)
        label = f"SimpleStrategy (RF={config.replication_factor})"
    else:
        if not config.dc_options:
            raise HTTPException(status_code=400, detail="dc_options est requis pour NetworkTopologyStrategy")
        alter_strategy_nts(config.dc_options)
        dc_detail = ", ".join([f"{k}={v}" for k, v in config.dc_options.items()])
        label = f"NetworkTopologyStrategy ({dc_detail})"
    
    # Réinitialise les données pour ne pas mélanger les simulations
    session = get_session()
    session.execute("TRUNCATE users")
    
    return {"message": f"Stratégie changée en {label}. Les données ont été réinitialisées."}


# ── Données ──────────────────────────────────────────────────────────────────

@app.get("/data/all")
def get_all_users():
    session = get_session()
    rows = session.execute("SELECT token(user_id), user_id, name, email FROM users")
    return {"users": [
        {"token": str(r[0]), "user_id": r.user_id, "name": r.name, "email": r.email}
        for r in rows
    ]}


@app.post("/data/insert")
def insert_user(user_id: str, name: str, email: str):
    session = get_session()

    # ── Vérification doublon (Option B : bloquer) ──
    existing = session.execute(
        "SELECT user_id FROM users WHERE user_id = %s", (user_id,)
    ).one()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"L'identifiant «{user_id}» existe déjà dans la base. Choisissez un autre ID ou utilisez la fonction Modifier."
        )

    session.execute(
        "INSERT INTO users (user_id, name, email) VALUES (%s, %s, %s)",
        (user_id, name, email)
    )
    row = session.execute(
        "SELECT token(user_id) FROM users WHERE user_id = %s", (user_id,)
    ).one()
    return {"user_id": user_id, "token": str(row[0]), "message": "Inséré avec succès"}


@app.put("/data/update")
def update_user(user_id: str, name: str = None, email: str = None):
    session = get_session()
    existing = session.execute(
        "SELECT user_id, name, email FROM users WHERE user_id = %s", (user_id,)
    ).one()
    if not existing:
        raise HTTPException(status_code=404, detail=f"L'utilisateur «{user_id}» n'existe pas.")

    new_name  = name  if name  else existing.name
    new_email = email if email else existing.email

    session.execute(
        "UPDATE users SET name = %s, email = %s WHERE user_id = %s",
        (new_name, new_email, user_id)
    )
    return {"user_id": user_id, "name": new_name, "email": new_email, "message": "Mis à jour avec succès"}


@app.delete("/data/delete/{user_id}")
def delete_user(user_id: str):
    session = get_session()
    existing = session.execute(
        "SELECT user_id FROM users WHERE user_id = %s", (user_id,)
    ).one()
    if not existing:
        raise HTTPException(status_code=404, detail=f"L'utilisateur «{user_id}» n'existe pas.")

    session.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
    return {"message": f"«{user_id}» supprimé avec succès"}


@app.get("/data/partition/{user_id}")
def get_partition_info(user_id: str):
    session = get_session()
    row = session.execute(
        "SELECT token(user_id), user_id, name, email FROM users WHERE user_id = %s",
        (user_id,)
    ).one()
    if not row:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return {"user_id": row.user_id, "name": row.name, "email": row.email, "token": str(row[0])}