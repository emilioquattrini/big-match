# BIG MATCH — configurazione GitHub Pages

Aggiornato il 7 ottobre 2026. L'utente ha confermato il passaggio di Pages Source a **GitHub Actions**. Questa guida completa le variabili pubbliche richieste dal workflow già presente; non modifica o disattiva i controlli di rilascio.

## Inserire le variabili del repository

Aprire il repository `emilioquattrini/big-match`, poi **Settings → Secrets and variables → Actions → Variables → New repository variable**. Per ogni riga copiare Name e Value e premere **Add variable**. Se una voce esiste già, aprirla e aggiornare il valore.

| Name | Value |
|---|---|
| `VITE_APP_URL` | `https://emilioquattrini.github.io/big-match/` |
| `VITE_EVENT_SLUG` | `big-2026` |
| `VITE_SUPABASE_URL` | `https://zwjzlzyqsqxqtjxhgmbs.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_TU_GC-BZ9hE6GBtF4mPLZQ_qLZyfSQd` |
| `PAGES_DEPLOY_ENABLED` | `true` |

La chiave qui riportata è la chiave **pubblicabile** `default` del progetto, verificata come abilitata il 7 ottobre 2026. È prevista per il frontend e non concede i privilegi di una chiave server. I ruoli browser non hanno accesso diretto alle tabelle o alle RPC applicative private. Se la chiave viene ruotata, aggiornare questo documento, la variabile e la build.

Le cinque voci devono essere **Repository variables**: il workflow legge `vars.*` prima del job di deploy. Il solo environment `github-pages` non configura quei job. `VITE_APP_BASE=/big-match/` è già impostato nel workflow.

## Cosa succede dopo

Il valore `PAGES_DEPLOY_ENABLED=true` abilita il workflow, ma non lo avvia. La pubblicazione richiede ancora un avvio esplicito da `main` con `publish=true`, oppure un tag `big-match-v*` riferito a un commit contenuto in `main`.

La pipeline esegue CI, compilazione e controllo `--production --check-backend`; pubblica solo l'artefatto `dist/` verificato. Un'informativa incompleta blocca quel controllo. La pagina pre-evento può essere pubblicata con evento draft e raccolta disabilitata dopo aver completato l'informativa. L'apertura della raccolta rimane una decisione separata.

Le istruzioni complete e i prerequisiti operativi sono in [RELEASE.md](RELEASE.md), [BACKEND.md](BACKEND.md) e [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Fonte operativa

[GitHub Docs — Store information in variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables), sezione “Creating configuration variables for a repository”, consultata il 7 ottobre 2026.
