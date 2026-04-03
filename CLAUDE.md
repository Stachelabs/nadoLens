# CLAUDE.md — NadoLens

> Règles de travail uniquement. Spec complète → PRD.md | Contexte business → About.md

---

## Références

| Doc                 | Contenu                                              |
| ------------------- | ---------------------------------------------------- |
| PRD.md              | Spec complète, phases, roadmap                       |
| ARCHI.md            | Architecture Wallet Explorer, data flow, composants  |
| About.md            | Contexte business, hébergement, pitch Frank          |
| lib/schemas/nado.ts | **Source de vérité des types** — Zod schemas         |

---

## Context7 — doc live des librairies

**Toujours utiliser Context7 — jamais se fier à la mémoire pour les librairies.**

IDs prioritaires :

```
/vercel/next.js          /wevm/wagmi       /wevm/viem
/pmndrs/zustand          /prisma/prisma    /tradingview/lightweight-charts
/colinhacks/zod/v4.0.1   /rainbow-me/rainbowkit   /recharts/recharts
```

> ⚠️ Recharts = graphiques dashboard (stats, barres, lignes) — PAS pour les charts de prix/trading.
> TradingView Lightweight Charts = uniquement pour les charts de prix/candlesticks.

---

## Package managers

| Périmètre              | Manager  | Raison                                 |
| ---------------------- | -------- | -------------------------------------- |
| App Next.js            | **pnpm** | Standard, compat shadcn/prisma/wagmi   |
| WS Proxy (`ws-proxy/`) | **Bun**  | Runtime WS natif, process long-running |

---

## Stack

Next.js 16 · TypeScript strict · Tailwind v4 · shadcn/ui · Zustand 5 · wagmi 2 · viem 2 · RainbowKit 2 · TradingView Lightweight Charts v5 · Zod 4 · Prisma 5 · Neon

---

## Méthode de travail — APEX

```bash
/apex -i implement <description>       # interactif — valider le plan avant de coder
/apex -a -s implement <description>    # auto + save
/apex -a -s -e implement <description> # economy — moins de tokens
```

Sonnet 4.6 par défaut. Basculer sur Opus 4.6 (`/model opus`) uniquement si Sonnet tourne en rond sur un problème d'architecture complexe.

---

## Règles TypeScript

- Zéro `any` — toujours typer explicitement
- Zéro `as unknown as X` — si besoin, le type est mal conçu
- Types Nado → `lib/schemas/nado.ts` (`z.infer<>`) — jamais re-déclarer ailleurs
- `fromX18BigInt(val: string): number` dans `types/nado.ts` pour toutes les conversions (BigInt, pas parseFloat)

---

## Règles architecture

**Client (browser)**

- Rendu React + Zustand stores
- Signing EIP-712 via wagmi/viem — jamais côté serveur
- SSE via `EventSource` vers WS Proxy Railway (utiliser `NEXT_PUBLIC_WS_PROXY_URL`)

**Serveur Next.js (Vercel)**

- `/api/pairs` — liste des paires Nado
- `/api/wallet/[address]` — proxy Nado Gateway (évite CORS)
- `/api/matches` — proxy Archive `matches` (chunk <= 5 subaccounts + pagination idx côté client)
- `/api/funding` — proxy Archive `interest_and_funding` (pagination max_idx côté client)
- Valider tous les bodies et réponses externes avec Zod `safeParse()`

**WS Proxy (Railway — Bun)**

- Région **eu-west4** (Pays-Bas) OBLIGATOIRE — IPs US East bloquées par Nado
- Utiliser le package `ws` (pas le WebSocket natif Bun) — Nado exige `Sec-WebSocket-Extensions: permessage-deflate`
- Ping toutes les 30s : `{ method: "ping" }`
- Champ `id` obligatoire dans chaque message subscribe

**Build Vercel**

- Script build : `"build": "prisma generate && next build"`
- Next.js 16 utilise **Turbopack par défaut** — `turbopack: {}` dans `next.config.ts`
- Wallet SDKs (MetaMask, WalletConnect) : `config.externals.push('pino-pretty', 'lokijs', 'encoding')` dans webpack (fallback `--webpack`)
- `ws-proxy/` exclu du tsconfig principal

**Jamais**

- ❌ Clé privée dans le code Next.js ou dans le browser
- ❌ Signing côté serveur
- ❌ `console.log` de payloads avec adresses ou signatures
- ❌ Committer `.env`, `.env.local`, `About.md`

---

## Documentation API Nado

La documentation de l'API Nado est disponible dans le dossier `.claude/docs/`.
Consulter le fichier approprié selon la tâche en cours :

| Tâche | Fichier |
|---|---|
| Fetch de l'historique (matches, orders, subaccounts, pagination, calcul PnL/fees/volume) | `.claude/docs/NADO_ARCHIVE_API.md` |
| Prix d'entrée moyen (account_snapshots, net_entry_unrealized) | `.claude/docs/NADO_ARCHIVE_API.md` |
| Queries temps réel (subaccount info, positions ouvertes, produits, prix) | `.claude/docs/NADO_GATEWAY_API.md` |
| Concepts (margin types, health, PnL settlement, fees, format bytes32, x18) | `.claude/docs/NADO_CONCEPTS.md` |
| Gestion des 429, backoff, erreurs, rate limits, changelog | `.claude/docs/NADO_RATE_LIMITS.md` |

### Interroger le RAG en langage naturel

```bash
pnpm docs:query:nado "<question>"
# Ex: pnpm docs:query:nado "fee calculation matches archive"
# Ex: pnpm docs:query:nado "pagination idx" --top-k 3
# Ex: pnpm docs:query:nado "rate limits" --filter /developer-resources/api
```

Rebuilder l'index : `pnpm docs:build:nado` (crawl + embed + verify)

### Règles critiques (à toujours respecter)

- Conversion x18 : toujours via `BigInt`, jamais `parseFloat` sur les grands nombres
- `realized_pnl` : ne compter que si `closed_amount !== 0`
- `totalFees = fee` (`fee` inclut déjà taker/maker + sequencer — `sequencer_fee` = breakdown uniquement, ne pas sommer)
- Fetch subaccounts : récupérer TOUS les subaccounts (default + isolated) avant le fetch matches
- `isolated: null` dans le body matches pour capturer cross ET isolated
- Pagination matches : `idx = page[page.length - 1].submission_idx`, stop si `page.length < 500`

### Marge isolée — parent vs poche (deux bytes32)

- **Parent** (ex. `default_1`) : celui qui **signe** les ordres. L’**Archive `matches`** attache les fills à `order.sender` = **parent** (la poche n’a pas d’historique matché à ce bytes32).
- **Poche** (auto-créée, autre bytes32) : **ledger** réel — `subaccount_info` sur la **poche** expose `perp_balances` du produit isolé ; sur le **parent**, le même `product_id` peut être à **amount 0** (position déplacée sur la poche).
- **`isolated_positions` query sur le parent** : liste les entrées avec `data[].subaccount` = bytes32 **poche** + `product_id` / balances. **Sur la poche** : réponse souvent **vide** (ce n’est pas l’ancre de listing).
- **App** : calcul **avg entry / VWAP depuis `matches`** → agréger par **parent** (et filtre produit / `isolated`). **Taille / quote** depuis Gateway → `subaccount_info` **poche** ou chaînage via `isolated_positions(parent)` → poche pour le `product_id`. Ne pas mélanger les deux bytes32 sans ce mapping.

---

## Règles composants

- Un composant = un fichier = une responsabilité
- `PascalCase.tsx` composants — `camelCase.ts` hooks et libs
- Hooks → `hooks/` préfixés `use` | Stores → `store/` suffixés `Store`
- **shadcn/ui obligatoire** pour tout élément UI de base
- Exceptions HTML natif autorisé : `<canvas>`, divs de layout, wrappers sémantiques sans état

**shadcn/ui — contrainte critique**

- `Button` utilise `@base-ui/react/button` → **pas de prop `asChild`**
- Pour un lien stylé bouton : `<Link className={cn(buttonVariants({ variant, size }))}>`
- Jamais `<Button asChild><Link>` — ça ne compile pas

---

## Thème NadoLens

| Token                         | Usage            |
| ----------------------------- | ---------------- |
| `text-foreground`             | Texte principal  |
| `text-muted-foreground`       | Texte secondaire |
| `bg-background`               | Fond page        |
| `bg-card`                     | Fond carte       |
| `border-border`               | Bordures         |
| `text-primary` / `bg-primary` | Emerald #22c55e  |
| `text-destructive`            | Rouge #ef4444    |

Semantic custom : `var(--bull)` vert · `var(--bear)` rouge · `var(--warn)` orange

**next-themes** : `ThemeProvider` en dehors de `Providers` dans `layout.tsx`. `suppressHydrationWarning` sur `<html>`.

**RainbowKit** : accent purple `#a855f7` · `locale="en"` · `coolMode` · `mounted` guard dans Providers pour éviter hydration mismatch.

---

## Nado API — rappels critiques

- Chain ID Ink L2 mainnet : **57073** (wagmi/viem) — ne pas confondre avec d'autres IDs
- Endpoint contract : `0xf8963f7860af7de9b94893edb9a3b5c155e1fc0c`
- Valeurs en **x18** → `fromX18BigInt()` pour les agrégations financières (volume, fees, pnl)
- ⚠️ **Exception V2** : `/v2/tickers` et `/v2/trades` retournent des **décimaux normaux**, PAS x18
- Subaccount bytes32 : `0x{address}64656661756c740000000000` (default)
- `product_id: null` sur stream `liquidation` = toutes les paires
- `book_depth` = diffs — size `"0"` = niveau supprimé du carnet
- Mainnet WS Gateway : `wss://gateway.prod.nado.xyz/v1/ws` (queries/executes)
- Mainnet WS Subscribe : `wss://gateway.prod.nado.xyz/v1/subscribe` (streams temps réel)
- Gateway v1 REST : `https://gateway.prod.nado.xyz/v1` | v2 : `https://gateway.prod.nado.xyz/v2`
- Archive v1 : `https://archive.prod.nado.xyz/v1` | v2 : `https://archive.prod.nado.xyz/v2` (POST JSON — pas REST)
- ⚠️ `gateway.nado.xyz` et `archive.nado.xyz` sont morts (404)

### addressToSubaccount — helper critique

```typescript
function addressToSubaccount(
  address: string,
  name: string = "default",
): string {
  const addr = address.toLowerCase().replace("0x", "");
  const nameHex = Buffer.from(name).toString("hex").padEnd(24, "0");
  return `0x${addr}${nameHex}`;
}
```

### Rate limits Wallet Explorer

- `subaccounts` archive : IP weight 2 (1× au load)
- `account_snapshots` archive : IP weight 2 (1× au load, pour les prix d'entrée)
- `matches` archive : IP weight 2+(limit×subaccounts/10) → limit=500, 1 sub = weight 52 (1× au load)
- `subaccount_info` : IP weight 2 × nb_subaccounts → polling 30s OK
- Total au load initial : ~56 weight → safe avec 2400/min max

---

## Git

Format : `feat(wallet): add equity curve` · `fix(ws-proxy): reconnect backoff`

Toujours une branche `feat/` ou `fix/` — jamais committer sur `main`. Chaque branche → Vercel Preview → tester → merge PR.

---

## Priorités MVP — ordre strict

1. ✅ WS Proxy Bun + `/health`
2. ✅ `useLiquidationStream` SSE → Zustand
3. ✅ Heatmap couche 1 + couche 2 → couche 3 (book_depth zones, optionnel)
4. ✅ Cockpit de Survie complet
5. ✅ **Wallet Explorer** (`/wallet/[address]`) — fresh install, composants restaurés
6. **→ Deploy & Polish** (README, GIF, push GitHub public, mail Frank)
7. Orderbook depth (post-polish)

---

_CLAUDE.md v2.3 — NadoLens_
