# $MAP - Solana Pixel Canvas

Canvas collaboratif 2048×2048 pixels sur Solana avec système de paiement.

## Fonctionnalités

- 🎨 **Pixels gratuits** - 1 pixel toutes les 60 secondes
- 🖼️ **Image Stamps** - Upload d'images converties en pixel art (payant)
- 🛡️ **Shields** - Zones de protection (payant)
- 💰 **Paiements Solana** - Via token $MAP

## Installation Windows

### 1. Prérequis
- Node.js 22+ : https://nodejs.org/
- PostgreSQL : https://www.postgresql.org/download/windows/

### 2. Base de données
```sql
CREATE DATABASE map_canvas;
```

### 3. Configuration
```powershell
cd backend
copy .env.example .env
# Éditer .env avec vos paramètres
```

### 4. Installation
```powershell
# Backend
cd backend
npm install
npm run db:migrate

# Frontend
cd ../frontend
npm install
```

### 5. Lancement
```powershell
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend
npm run dev
```

### 6. Ouvrir
http://localhost:5173

## Configuration Production

Pour activer les vrais paiements, configurer dans `.env`:
- `TREASURY_WALLET` : Adresse du wallet qui recevra les paiements
- `MAP_TOKEN_MINT` : Adresse du token $MAP sur Solana
- `SOLANA_RPC_URL` : URL du RPC Solana (mainnet)

## Prix

| Feature | Taille | Prix |
|---------|--------|------|
| Stamp | 32×32 | 100 $MAP |
| Stamp | 64×64 | 300 $MAP |
| Stamp | 128×128 | 800 $MAP |
| Shield | 64×64 - 1 jour | 50 $MAP |
| Shield | 64×64 - 3 jours | 120 $MAP |
| Shield | 64×64 - 7 jours | 200 $MAP |
| Shield | 64×64 - 30 jours | 500 $MAP |
