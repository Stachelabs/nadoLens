# CLAUDE.md — NadoLens
> Règles de travail uniquement. Spec complète → PRD.md | Contexte business → About.md

---

## Références

| Doc | Contenu |
|---|---|
| PRD.md | Spec complète, API Nado, phases |
| NADO_API.md | Référence API complète, response shapes, rate limits |
| ARCHI.md | Architecture Wallet Explorer, data flow, composants |
| About.md | Contexte business, hébergement, pitch Frank |
| lib/schemas/nado.ts | **Source de vérité des types** — Zod schemas |

---

## Context7 — doc live des librairies

**Toujours utiliser Context7 — jamais se fier à la mémoire pour les librairies.**

IDs prioritaires :
```
/vercel/next.js          /wevm/wagmi       /wevm/viem
/pmndrs/zustand          /prisma/prisma    /tradingview/lightweight-charts
/colinhacks/zod/v4.0.1
```

---

## Package managers

| Périmètre | Manager | Raison |
|---|---|---|
| App Next.js | **pnpm** | Standard, compat shadcn/prisma/wagmi |
| WS Proxy (`ws-proxy/`) | **Bun** | Runtime WS natif, process long-running |

---

## Stack

Next.js 15 · TypeScript strict · Tailwind v4 · shadcn/ui · Zustand 5 · wagmi 3 · viem 2 · TradingView Lightweight Charts v5 · Zod 4 · Prisma 5 · Neon

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
- `fromX18(val: string): number` dans `types/nado.ts` pour toutes les conversions

---

## Règles architecture

**Client (browser)**
- Rendu React + Zustand stores
- Signing EIP-712 via wagmi/viem — jamais côté serveur
- SSE via `EventSource` vers WS Proxy Railway (utiliser `NEXT_PUBLIC_WS_PROXY_URL`)

**Serveur Next.js (Vercel)**
- `/api/liquidations` — Neon DB
- `/api/oi-heatmap` — OI estimé
- `/api/wallet/[address]` — proxy Nado Gateway (évite CORS)
- Valider tous les bodies et réponses externes avec Zod `safeParse()`

**WS Proxy (Railway — Bun)**
- Région **eu-west4** (Pays-Bas) OBLIGATOIRE — IPs US East bloquées par Nado
- Utiliser le package `ws` (pas le WebSocket natif Bun) — Nado exige `Sec-WebSocket-Extensions: permessage-deflate`
- Ping toutes les 30s : `{ method: "ping" }`
- Champ `id` obligatoire dans chaque message subscribe

**Build Vercel**
- Script build : `"build": "prisma generate && next build"`
- Wagmi optional peer deps exclus via `webpack resolve.alias = false` dans `next.config.ts`

**Jamais**
- ❌ Clé privée dans le code Next.js ou dans le browser
- ❌ Signing côté serveur
- ❌ `console.log` de payloads avec adresses ou signatures
- ❌ Committer `.env`, `.env.local`, `About.md`

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

| Token | Usage |
|---|---|
| `text-foreground` | Texte principal |
| `text-muted-foreground` | Texte secondaire |
| `bg-background` | Fond page |
| `bg-card` | Fond carte |
| `border-border` | Bordures |
| `text-primary` / `bg-primary` | Emerald #22c55e |
| `text-destructive` | Rouge #ef4444 |

Semantic custom : `var(--bull)` vert · `var(--bear)` rouge · `var(--warn)` orange

**next-themes** : `ThemeProvider` en dehors de `Providers` dans `layout.tsx`. `suppressHydrationWarning` sur `<html>`.

---

## Nado API — rappels critiques

- Chain ID Ink L2 mainnet : **763373**
- Endpoint contract : `0xf8963f7860af7de9b94893edb9a3b5c155e1fc0c`
- Valeurs en **x18** → `fromX18()` systématiquement
- ⚠️ **Exception V2** : `/v2/tickers` et `/v2/trades` retournent des **décimaux normaux**, PAS x18
- Subaccount bytes32 : `0x{address}64656661756c740000000000` (default)
- `product_id: null` sur stream `liquidation` = toutes les paires
- `book_depth` = diffs — size `"0"` = niveau supprimé du carnet
- Mainnet WS Gateway : `wss://gateway.prod.nado.xyz/v1/ws` (queries/executes)
- Mainnet WS Subscribe : `wss://gateway.prod.nado.xyz/v1/subscribe` (streams temps réel)
- Gateway v1 REST : `https://gateway.prod.nado.xyz/v1` | v2 : `https://gateway.prod.nado.xyz/v2`
- Archive v1 : `https://archive.prod.nado.xyz/v1` | v2 : `https://archive.prod.nado.xyz/v2`
- ⚠️ `gateway.nado.xyz` et `archive.nado.xyz` sont morts (404)

### addressToSubaccount — helper critique

```typescript
function addressToSubaccount(address: string, name: string = 'default'): string {
  const addr = address.toLowerCase().replace('0x', '')
  const nameHex = Buffer.from(name).toString('hex').padEnd(24, '0')
  return `0x${addr}${nameHex}`
}
```

### Rate limits Wallet Explorer
- `subaccount_info` : IP weight 2 → polling 30s OK (2 × 2/min = 4 weight)
- `matches` archive : IP weight 2+(limit×subaccounts/10) → limit=500, 1 sub = weight 52
- `subaccounts` archive : IP weight 2
- Total par refresh : ~56 weight → safe avec 2400/min max

---

## Git

Format : `feat(heatmap): add OI layer 3` · `fix(ws-proxy): reconnect backoff`

Toujours une branche `feat/` ou `fix/` — jamais committer sur `main`. Chaque branche → Vercel Preview → tester → merge PR.

---

## Priorités MVP — ordre strict

1. ✅ WS Proxy Bun + `/health`
2. ✅ `useLiquidationStream` SSE → Zustand
3. ✅ Heatmap couche 1 + couche 2 → couche 3 (book_depth zones, optionnel)
4. ✅ Cockpit de Survie complet
5. **→ Wallet Explorer** (`/wallet/[address]`)
6. Orderbook depth
7. Deploy & Polish (README, GIF, push GitHub, mail Frank)

---

*CLAUDE.md v2.1 — NadoLens*
