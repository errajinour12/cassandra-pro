# 🍩 SimCassandra - Simulateur Visuel Apache Cassandra

SimCassandra est un outil éducatif et interactif conçu pour comprendre le fonctionnement interne d'**Apache Cassandra**. Il combine un **véritable cluster Cassandra (via Docker)** avec une **interface web visuelle et pédagogique** pour observer en temps réel comment les données sont distribuées, répliquées et gérées en cas de panne.

---

## 🏗️ Architecture du projet

Le projet est divisé en 3 couches principales :

1. **Le Cluster (Docker)** : `docker-compose.yml` déploie **6 véritables nœuds Cassandra** configurés en réseau local, répartis de manière optionnelle sur plusieurs Datacenters pour simuler une topologie réseau complexe.
2. **Le Backend (Python / FastAPI)** : Sert de pont entre l'interface visuelle et la base de données. Il utilise le driver officiel `cassandra-driver`.
3. **Le Frontend (React / Vite)** : Une interface "NOC/Dashboard" épurée qui écoute le backend et dessine de façon dynamique l'anneau de hachage, les chemins de réplication, la consistance, et simule les pannes via un moteur de rendu de particules fluide (SVG/requestAnimationFrame).

---

## 🚀 Nouveautés Récentes (Refonte Globale)

Le projet a subi une refonte majeure de son interface et de son moteur pédagogique pour refléter avec rigueur technique l'architecture de Cassandra :

- **Refonte Pédagogique des Flux** : Les chemins d'Écriture, de Mise à jour (LWW) et de Suppression (Tombstones) sont désormais des onglets distincts, techniquement justes et animés par un système de particules fluides à très haute performance.
- **Topologie NTS (NetworkTopologyStrategy)** : Le simulateur gère désormais la configuration Multi-DC. L'interface scinde physiquement les nœuds en Datacenters distincts, offrant un visuel Cisco-style pour observer le trafic WAN vs LAN.
- **Protocole Gossip Actif** : L'onglet "Architecture Globale" modélise en direct le maillage (Mesh) et les échanges de signaux Gossip entre les nœuds.
- **Moteur de Consistance Réaliste** : Prise en charge stricte de tous les niveaux de consistance (`ONE`, `QUORUM`, `LOCAL_QUORUM`, `ALL`, `EACH_QUORUM`, `LOCAL_ONE`) avec blocage des ACK visuels si le Quorum réseau n'est pas atteint.
- **Densité Visuelle SaaS** : L'interface graphique a été resserrée pour adopter un format "Dashboard Data-Intensive" (moins de marges, affichage matériel sous forme de cartes serveurs avec LEDs d'activité).
- **Persistance Frontend** : La configuration (stratégie, consistance, panne de nœuds) est sauvegardée en cache local, évitant la perte d'UX lors d'un rechargement de page (`F5`).

---

## 🛠️ Prérequis

Pour lancer ce projet sur votre machine, vous devez installer :
- **Docker Desktop** (pour faire tourner les nœuds Cassandra)
- **Python 3.10+** (pour l'API)
- **Node.js & npm** (pour l'interface React)

---

## 🚀 Installation et Lancement (Étape par Étape)

### Étape 1 : Démarrer le Cluster Cassandra
Ouvrez un terminal à la racine du projet et lancez Docker :
```bash
docker compose up -d
```
*(Attention : Lancer 6 nœuds Cassandra demande des ressources et prend plusieurs minutes à s'initialiser. Vous pouvez vérifier l'état des nœuds avec `docker compose logs -f`)*.

### Étape 2 : Lancer le Backend (API FastAPI)
Ouvrez un **deuxième terminal**, placez-vous dans le dossier `backend` :
```bash
cd backend
# (Optionnel) Créer un environnement virtuel : python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
L'API tournera sur `http://127.0.0.1:8000`.

### Étape 3 : Lancer le Frontend (Interface React)
Ouvrez un **troisième terminal**, placez-vous dans le dossier `frontend` :
```bash
cd frontend
npm install
npm run dev
```
L'application web s'ouvrira sur l'adresse indiquée dans votre terminal (ex: `http://localhost:5173`).

---

## 📖 Guide de l'Interface Utilisateur

Une fois sur l'application web, choisissez votre **Stratégie (SimpleStrategy ou NTS)**. Vous accéderez ensuite au tableau de bord divisé en onglets clés :

1. **Architecture Globale & Gossip** : Vue géographique de votre cluster. Observez le réseau maillé (P2P) et les pings Gossip traverser le WAN ou le LAN.
2. **Partitionnement / Token Ring** : Visualisation de l'anneau de hachage (Murmur3) et mise en évidence de la charge des VNodes (Virtual Nodes).
3. **Pannes & Quorum** : Simulateur interactif. Cliquez sur un nœud pour le "tuer" et testez si vos requêtes parviennent toujours à satisfaire le Niveau de Consistance sélectionné dans la barre supérieure.
4. **Flux Dynamiques (Écriture, Maj, Suppression)** : Lancez une opération depuis le panneau de droite et observez les données voyager du client vers le coordinateur, puis vers les réplicas.

---

## 🤝 Contribution (Pour le groupe)
Si vous souhaitez modifier le code :
- L'interface principale et son routing sont dans `frontend/src/App.jsx`.
- Les animations haute-performance sont des composants React (ex: `WritePath.jsx`, `UpdatePath.jsx`) utilisant `requestAnimationFrame` et des canevas SVG natifs.
- La logique de connexion à la base de données est dans `backend/cassandra_client.py`.
