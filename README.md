# NadoLens

Outil d'analyse on-chain pour le protocole **[Nado](https://nado.xyz)** — DEX à carnet d'ordres centralisé (CLOB) déployé sur Ink L2.

Projet en cours de développement. Actuellement implémenté : heatmap de liquidation temps réel, cockpit du carnet d'ordres, et explorateur de wallet (`/wallet/[address]`).

---

## Stack

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 — App Router + Turbopack |
| Langage | TypeScript strict |
| Style | Tailwind CSS v4 + shadcn/ui |
| État client | Zustand 5 |
| Wallet / Blockchain | wagmi 2 · viem 2 · RainbowKit 2 |
| Charts trading | TradingView Lightweight Charts v5 |
| Charts stats | Recharts |
| Validation | Zod 4 |
| Base de données | Prisma 5 + Neon (PostgreSQL serverless) |
| WS Proxy | Bun (Railway — région eu-west4) |

---

## Prérequis

- **Node.js** ≥ 20
- **pnpm** ≥ 10 (`npm i -g pnpm`)
- **Ollama** *(optionnel — pour le pipeline docs RAG)* — [installer](https://ollama.com/download), puis `ollama pull nomic-embed-text`. Doit tourner en arrière-plan (`ollama serve`) pendant toute utilisation des commandes `docs:*`.

---

## Installation

```bash
pnpm install
cp .env.example .env
# Renseigner DATABASE_URL, NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, WS_PROXY_URL
```

---

## Variables d'environnement

Copier `.env.example` → `.env` :

| Variable | Requis | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Connexion Neon PostgreSQL |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | ✅ | ID projet WalletConnect Cloud |
| `WS_PROXY_URL` + `NEXT_PUBLIC_WS_PROXY_URL` | ✅ | URL publique du WS Proxy Railway |
| `NADO_GATEWAY_REST` | ✅ | `https://gateway.prod.nado.xyz/v1` |
| `NADO_ARCHIVE_REST` | ✅ | `https://archive.prod.nado.xyz/v1` |
| `OPENAI_API_KEY` | ✗ | Uniquement si `NADO_DOCS_EMBED_PROVIDER=openai` dans la config RAG |

> La configuration non-secrète du pipeline RAG (URLs, concurrence, modèles d'embedding) est dans [`scripts/docs-rag/nado-docs.config.ts`](scripts/docs-rag/nado-docs.config.ts) — pas besoin de variables d'environnement pour ces valeurs.

---

## Scripts disponibles

### Application

| Commande | Description |
|---|---|
| `pnpm dev` | Serveur de développement sur `http://localhost:3000` (Turbopack) |
| `pnpm build` | Génère le client Prisma puis compile Next.js pour la production |
| `pnpm start` | Démarre Next.js en mode production (nécessite `pnpm build` au préalable) |
| `pnpm lint` | ESLint sur l'ensemble du projet |

### Tests

| Commande | Description |
|---|---|
| `pnpm test` | Lance Vitest en mode run-once (CI) |
| `pnpm test:watch` | Lance Vitest en mode watch (développement) |


---

### Pipeline Docs RAG

Le pipeline RAG permet d'interroger la documentation Nado en **langage naturel** depuis le terminal ou depuis Claude Code, sans passer par un navigateur.

Il crawle `docs.nado.xyz`, découpe les pages en chunks markdown, les encode en vecteurs via Ollama ou OpenAI, et stocke le tout dans un SQLite local sous `.claude/docs/rag/`.

**Prérequis Ollama** (provider par défaut) — requis pour `docs:index:nado` **et** `docs:query:nado` (les deux embedent du texte via Ollama). `docs:sync:nado` et `docs:verify:nado` n'en ont pas besoin.

```bash
ollama serve                   # à lancer une fois, reste en arrière-plan
ollama pull nomic-embed-text   # à faire une seule fois
```

Pour utiliser OpenAI à la place : modifier `NADO_DOCS_EMBED_PROVIDER` dans [`scripts/docs-rag/nado-docs.config.ts`](scripts/docs-rag/nado-docs.config.ts) et ajouter `OPENAI_API_KEY` dans `.env`.

---

#### `pnpm docs:sync:nado` — Crawler

Crawle `https://docs.nado.xyz` à partir du sitemap et des liens internes, respecte `robots.txt`, convertit chaque page HTML en markdown propre.

**Artéfacts générés :**

| Chemin | Contenu |
|---|---|
| `.claude/docs/rag/pages-md/` | Pages converties en Markdown (1 fichier / page) |
| `.claude/docs/rag/pages-json/` | Métadonnées de chaque page (titre, headings, liens sortants, status HTTP) |
| `.claude/docs/nado-manifest.json` | Manifeste complet (pages, graphe de liens, redirections, URLs sitemap) |
| `.claude/docs/rag/crawl-state.json` | État de reprise (utilisé avec `NADO_DOCS_RESUME=1`) |

**Options principales** (éditables dans [`nado-docs.config.ts`](scripts/docs-rag/nado-docs.config.ts)) :

| Option | Défaut | Description |
|---|---|---|
| `NADO_DOCS_CONCURRENCY` | `2` | Pages crawlées en parallèle |
| `NADO_DOCS_MAX_DEPTH` | `32` | Profondeur de crawl maximale |
| `NADO_DOCS_MAX_RETRIES` | `4` | Tentatives par page en cas d'erreur réseau |
| `NADO_DOCS_TIMEOUT_MS` | `45000` | Timeout HTTP par requête (ms) |
| `NADO_DOCS_MAX_FAIL_RATIO` | `0.08` | Ratio d'échecs max avant erreur fatale (8 %) |

**Overrides ponctuels** — passés en préfixe de commande dans le shell (pas besoin de les mettre dans `.env`) :

```bash
NADO_DOCS_DRY_RUN=1 pnpm docs:sync:nado       # limite à 5 pages — test rapide
NADO_DOCS_RESUME=1 pnpm docs:sync:nado         # reprend depuis crawl-state.json
NADO_DOCS_LOG_LEVEL=debug pnpm docs:sync:nado  # logs détaillés
```

---

#### `pnpm docs:index:nado` — Indexer

Lit le manifeste, chunk chaque page markdown en sections (~2 200 chars), appelle le modèle d'embedding par batch, et stocke les vecteurs Float32 dans SQLite.

**Artéfact généré :**

| Chemin | Contenu |
|---|---|
| `.claude/docs/rag/rag.sqlite` | Base vectorielle (table `chunks` : texte + embedding + hash) |

**Indexation incrémentale :** une page déjà indexée avec le même `contentHash` est automatiquement skippée — relancer l'index après un `sync` est toujours rapide.

> ⚠️ Si tu changes de provider embedding (Ollama ↔ OpenAI), les dimensions vectorielles sont incompatibles (768 vs 1 536 dims). Toute tentative de requête avec des dimensions incorrectes lève une erreur explicite. Relancer `pnpm docs:index:nado` recrée l'index depuis zéro.

**Options** — défauts dans [`nado-docs.config.ts`](scripts/docs-rag/nado-docs.config.ts), surchargeables en préfixe de commande :

| Option | Défaut | Description |
|---|---|---|
| `NADO_DOCS_EMBED_PROVIDER` | `ollama` | `ollama` ou `openai` |
| `NADO_DOCS_EMBED_BATCH_SIZE` | `12` | Textes envoyés par batch à l'embedder |
| `NADO_DOCS_CHUNK_MAX_CHARS` | `2200` | Budget caractères par chunk |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | URL Ollama local |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Modèle Ollama |
| `OPENAI_EMBED_MODEL` | `text-embedding-3-small` | Modèle OpenAI |

---

#### `pnpm docs:verify:nado` — Vérifier la couverture

Vérifie que toutes les URLs du menu de navigation sont bien présentes dans le manifeste, et détecte les liens internes cassés.

**Artéfact généré :**

| Chemin | Contenu |
|---|---|
| `.claude/docs/reports/nado-coverage-report.md` | Rapport de couverture (nav manquante + liens cassés) |

**Exit code** `1` si des pages de navigation sont absentes de l'index.

---

#### `pnpm docs:build:nado` — Pipeline complet

Enchaîne les trois étapes en une seule commande : **sync → index → verify**.

```bash
pnpm docs:build:nado
```

À relancer après une mise à jour significative de la documentation Nado, ou lors du premier setup.

---

#### Réinitialiser l'index depuis zéro

À faire lors d'un changement de provider d'embedding (Ollama ↔ OpenAI), d'une restructuration profonde de la doc Nado, ou si l'index semble corrompu.

```bash
# Supprimer tous les artéfacts générés
rm -rf .claude/docs/rag/               # SQLite, pages-md/, pages-json/, crawl-state
rm -f .claude/docs/nado-manifest.json  # Manifeste du crawl
rm -rf .claude/docs/reports/           # Rapports de couverture

# Relancer le pipeline complet depuis zéro
pnpm docs:build:nado
```

> Les fichiers `.md` dans `.claude/docs/` (`NADO_ARCHIVE_API.md`, `NADO_GATEWAY_API.md`, etc.) sont des docs **manuelles** — ne pas les supprimer.

---

#### `pnpm docs:query:nado "<question>"` — Recherche sémantique

Interroge l'index local en langage naturel. Embed la question, calcule la similarité cosinus sur tous les chunks, affiche les top-K résultats avec score et extrait de texte.

```bash
# Recherche basique
pnpm docs:query:nado "fee calculation matches archive"

# Limiter le nombre de résultats
pnpm docs:query:nado "pagination idx" --top-k 3

# Filtrer par section de l'API
pnpm docs:query:nado "rate limits" --filter /developer-resources/api
```

**Options :**

| Option | Défaut | Description |
|---|---|---|
| `--top-k N` | `5` | Nombre de résultats retournés |
| `--filter <path>` | — | Filtrer par préfixe de chemin URL (ex: `/developer-resources/api`) |

**Exemple de sortie :**

```
Query  "fee calculation matches archive"

  #1  score: 0.871  /developer-resources/api/archive-indexer/matches
      "fee: The amount of trading fees + sequencer fees paid on this match..."

  #2  score: 0.834  /developer-resources/concepts/fees
      "The fee field already includes sequencer fees. Do not sum fee + sequencer_fee..."

  #3  score: 0.801  /developer-resources/api/archive-indexer/matches
      "sequencer_fee: Breakdown of the sequencer portion only — already included in fee..."
```

---

#### Intégration Claude Code

Claude Code lit `CLAUDE.md` au démarrage de chaque conversation. `CLAUDE.md` référence la commande `pnpm docs:query:nado` dans la section `## Documentation API Nado`. Claude peut donc interroger le RAG **directement depuis le chat**, sans copier-coller de docs.

**Workflow :**
1. S'assurer que l'index est à jour : `pnpm docs:build:nado`
2. Ouvrir une conversation Claude Code dans ce repo
3. Poser la question directement — Claude exécute `pnpm docs:query:nado` en arrière-plan si besoin

**Exemples de questions utiles :**

```bash
# Comportement de l'API
pnpm docs:query:nado "comment fonctionne la pagination avec submission_idx"
pnpm docs:query:nado "fee calculation matches archive sequencer"
pnpm docs:query:nado "format subaccount bytes32 default isolated"

# Rate limits et erreurs
pnpm docs:query:nado "rate limits weight par endpoint"
pnpm docs:query:nado "gestion des 429 backoff"

# Types de données
pnpm docs:query:nado "x18 format conversion bigint"
pnpm docs:query:nado "realized pnl closed_amount settlement"
```

> L'index doit être reconstruit (`pnpm docs:build:nado`) après chaque mise à jour majeure de la doc Nado pour que les réponses restent fiables.

---

#### Niveau de log

Toutes les commandes `docs:*` utilisent `NADO_DOCS_LOG_LEVEL` :

| Valeur | Usage |
|---|---|
| `debug` | Tous les détails (pages skippées, timings par batch, dedup) |
| `info` | Standard — défaut |
| `warn` | Avertissements et erreurs uniquement |
| `error` | Erreurs fatales uniquement |

```bash
NADO_DOCS_LOG_LEVEL=debug pnpm docs:build:nado
```

---

## Structure du projet

```
app/                      # Next.js App Router (pages, layouts, routes API)
  api/
    pairs/                # Liste des paires Nado (proxy Gateway)
    wallet/[address]/     # Proxy Gateway — subaccount info
    subaccounts/[address]/# Proxy Archive — liste des subaccounts
    matches/              # Proxy Archive — historique des trades (chunks 5 subaccounts)
    funding/              # Proxy Archive — intérêts & funding
components/               # Composants React (heatmap, cockpit, wallet explorer…)
hooks/                    # Hooks (useWalletData, useLiquidationStream, useOrderBook…)
store/                    # Zustand stores (liquidation, pairs, wallet)
lib/
  docs-rag/               # Pipeline RAG complet (crawler, chunker, embeddings, SQLite)
  schemas/                # Zod schemas — source de vérité des types Nado
scripts/
  docs-rag/               # CLI du pipeline RAG + config committée
    cli.ts                # Point d'entrée des commandes docs:*
    nado-docs.config.ts   # Config non-secrète (base URL, concurrence, modèles…)
prisma/                   # Schema Prisma + migrations
ws-proxy/                 # WS Proxy Bun (Railway) — relay WebSocket Nado
.claude/
  docs/                   # Documentation Nado (.md) + index RAG (rag.sqlite)
  docs/rag/               # Artéfacts générés : pages-md/, pages-json/, crawl-state
```

---

## Architecture

Voir [`ARCHI.md`](ARCHI.md) pour le détail du data flow, des composants et des choix techniques.

Voir [`CLAUDE.md`](CLAUDE.md) pour les règles de développement, les contraintes stack et les règles critiques de l'API Nado.
