# BIG MATCH — sviluppo, verifica e rilascio

Guida operativa aggiornata il 6 ottobre 2026. Il codice comprende frontend, API, migrazione, test e pipeline. La presenza di questi file **non significa che il nuovo backend o la nuova versione siano già pubblicati**. L'esito del rilascio va registrato con commit, run CI e prove sul servizio configurato.

Il perimetro corrente è: 13 carte originali, telefono personale del visitatore, una risposta modificabile per sessione del browser, risultati e mappa aggregati, Story PNG, link di composizione e richiesta facoltativa del catalogo. Non c'è un login da compilare. Il servizio crea una sessione anonima tecnica quando serve una prima operazione privata. Il catalogo viene evaso manualmente dallo studio; il form non dichiara un'email già inviata. Kiosk multiutente e pannello amministrativo non sono implementati.

## 1. Prima di unire il codice a main

**Nell'audit il sito esistente era pubblicato da un branch GitHub Pages.** Verificare `Settings → Pages → Build and deployment → Source` prima del merge. Se è ancora `Deploy from a branch`, il merge del nuovo `index.html` Vite può pubblicare sorgenti TypeScript non compilati. Il gate del nuovo workflow non disabilita quel meccanismo precedente.

Mantenere il lavoro nel branch/PR finché il responsabile non imposta Pages su **GitHub Actions** e verifica la versione live corrente. Poi si può unire il PR senza avviare il nuovo deploy: la pubblicazione del workflow rimane disabilitata finché la variabile `PAGES_DEPLOY_ENABLED` non vale esattamente `true`. Il cambiamento dell'impostazione e il deploy sono operazioni distinte.

L'indirizzo da conservare è `https://emilioquattrini.github.io/big-match/`. Tutti gli asset, il manifest e il service worker rispettano `/big-match/`; i risultati usano un hash, per esempio `#/r/big-2026/impersonae-v1/1-2-3`. Non richiedono riscritture del server per le sottopagine.

## 2. Avvio e comandi

Usare Node 24 e il lockfile versionato. Una copia di `.env.example` in `.env.local` può contenere le sole impostazioni pubbliche del frontend. Con entrambi i campi Supabase vuoti rimangono disponibili scelta delle carte e poster locale; i servizi della community risultano esplicitamente indisponibili.

```sh
npm ci
npm run dev
```

Controlli dell'app e dell'artefatto:

```sh
npm run typecheck
npx tsc --project tests/e2e/tsconfig.json
npx tsc --project supabase/functions/big-match/tsconfig.json --noEmit
npm test
npm run test:sw
npm run build
npm run check:release
npm run preview
```

`npm run build` esegue TypeScript, Vite e la generazione del service worker. `dist/` è l'unica cartella da pubblicare. Non pubblicare la radice del repository, migrazioni, test o file di ambiente.

`check:release` verifica prefisso, manifest, asset referenziati, credenziali private riconoscibili, budget statico di 10 MiB e coerenza tra la configurazione della build e quella del controllo. Una variazione delle variabili dopo la build richiede una nuova build. Il controllo non stampa chiavi o dati delle richieste.

### Test browser con servizi fittizi

La suite usa il vero frontend compilato, il vero SDK Auth e risposte HTTP controllate. Le fixture non verificano un backend ospitato: i vincoli SQL hanno test separati. In una shell dedicata impostare:

```sh
export VITE_APP_BASE=/big-match/
export VITE_EVENT_SLUG=big-2026
export VITE_APP_URL=http://127.0.0.1:4175/big-match/
export VITE_SUPABASE_URL=https://big-match-test.supabase.co
export VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_e2e_fixture_only_000000000000
npm run build
npm run check:release
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

Questi valori sono fixture pubbliche senza credenziali reali. Tutte le richieste HTTP verso origini diverse dal server locale e dall'host fixture vengono bloccate; l'host fixture viene interamente intercettato. Nessun test deve inviare risposte o contatti a un evento reale. La configurazione Playwright rifiuta un `E2E_BASE_URL` non locale.

Il report è in `playwright-report/`; trace, schermate e PNG scaricati sono in `test-results/`. Il test PNG controlla i byte del file scaricato, inclusa la dimensione nativa 1080×1920, e allega il file alla prova. Chromium con viewport mobile è un'emulazione e WebKit su Linux non è un iPhone reale.

Le prove del contratto HTTP disabilitano il worker soltanto in `community.spec.ts`, come raccomandato dalla [documentazione Playwright sul routing](https://playwright.dev/docs/network#missing-network-events-and-service-workers): le richieste gestite da un worker possono sfuggire ai mock. Le prove dedicate mantengono il worker reale. Per il recupero dalla cache, Chromium usa `setOffline(true)`; WebKit 1.63 usa un'origine locale isolata che viene effettivamente spenta, perché [l'issue upstream #42775](https://github.com/microsoft/playwright/issues/42775) documenta un errore dell'emulazione offline anche con risposte locali del worker. Un controllo `fetch` con `no-store` deve fallire prima del reload dalla cache. Questa prova WebKit verifica l'indisponibilità dell'origine e non sostituisce la modalità aereo su Safari fisico.

La CI pubblica anche un artefatto separato `browser-visuals-*` con i tre PNG, schermate desktop/mobile e diagnostica HTTP essenziale senza header, token o corpi dei form. Rimane piccolo e consultabile separatamente dagli archivi trace del report completo.

## 3. Configurazione pubblica e server

| Variabile frontend | Requisito |
|---|---|
| `VITE_APP_BASE` | `/big-match/`, anche nelle prove di staging. |
| `VITE_APP_URL` | Radice HTTPS canonica con lo stesso prefisso e slash finale; richiesta dal gate di produzione. |
| `VITE_EVENT_SLUG` | Evento esistente, normalmente `big-2026`; solo lettere minuscole, numeri e trattini. |
| `VITE_SUPABASE_URL` | Origine HTTPS del progetto; niente path, query o credenziali nell'URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chiave pubblicabile o legacy `anon`. Mai una chiave `secret`/`service_role`. |

Vite incorpora queste variabili nei file pubblici: non sono un deposito di segreti. Le chiavi private e `BIG_MATCH_RATE_LIMIT_SECRET` rimangono nel backend. Le variabili server, migrazioni, apertura dell'evento, retention e gestione del catalogo sono documentate in [BACKEND.md](BACKEND.md).

Il progetto Supabase deve appartenere al titolare dell'app. Lo staging deve avere un progetto/dataset separato dalla produzione. Configurare l'origine CORS esatta del sito: per Pages è `https://emilioquattrini.github.io`, senza `/big-match/`. CORS non sostituisce autorizzazione e privilegi SQL.

Il seed crea un evento **draft**, senza risposte e con contatti disabilitati. Prima di aprirlo servono titolare e contatto reali, informativa approvata/versionata, finestra di raccolta, retention e carte ammesse. L'evento pubblico riflette anche le date: le prove precedenti alla fiera usano un evento di staging con date adatte. Non inserire risposte di prova nella produzione per rendere interessanti i conteggi.

## 4. CI e pubblicazione controllata

`ci.yml` viene eseguito sui PR e sui push a `main`, `feat/**` e `fix/**`; è richiamabile dal workflow di pubblicazione. Esegue verifiche TypeScript, test applicativi/SQL, test del worker, build, controllo dell'artefatto e Playwright. Usa esclusivamente configurazione pubblica fittizia. Carica report e un artefatto `fixture-preview-*`, che **non è un artefatto di produzione**. Le action sono fissate a SHA verificati dai tag dei repository ufficiali il 6 ottobre 2026; la versione corrispondente è nel commento YAML.

`pages.yml` non pubblica a ogni push. Sono necessari:

1. Pages configurato su GitHub Actions, come descritto sopra.
2. Variabili del repository `VITE_APP_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_EVENT_SLUG` coerenti con l'ambiente destinazione.
3. Variabile `PAGES_DEPLOY_ENABLED=true`.
4. Avvio manuale da `main` con `publish=true`, oppure push di un tag `big-match-v*` che punti a un commit contenuto in `main`.
5. CI superata, nuova build con configurazione effettiva e controllo `--production --check-backend` superato.

Il gate di produzione rifiuta configurazione assente, chiavi private, URL locali e incoerenze di prefisso. Il controllo remoto legge soltanto `GET /events/:slug` e verifica informativa, catalogo e stato pubblico. Non crea una sessione, partecipazione o richiesta catalogo. Accetta `draft` con configurazione completa per pubblicare la pagina prima della fiera, e `closed` per un rilascio di archivio: **il via libera alla raccolta richiede invece evento aperto nella finestra prevista**.

Solo il job finale possiede `pages:write` e `id-token:write`. I job di validazione non ricevono segreti di backend e non eseguono deploy. Le impostazioni di protezione dell'ambiente `github-pages`, se presenti nel repository, restano un ulteriore controllo del responsabile.

## 5. Staging e prova prima della fiera

Servire l'artefatto di staging da un'origine separata conservando `/big-match/`, oppure usare il preview locale sullo stesso prefisso. Il workflow di questo repository pubblica la produzione Pages; non crea automaticamente un secondo sito. Nessun QR destinato al pubblico deve puntare all'host fixture o allo staging.

Eseguire la matrice di [ACCEPTANCE.md](ACCEPTANCE.md) sul commit candidato. Per i servizi ospitati verificare con identità e indirizzi di prova: primo invio, aggiornamento, retry, cancellazione, consenso alla sola richiesta catalogo, stato chiuso e permessi. Verificare i limiti reali dell'Auth anonima dietro l'IP condiviso della fiera, il gateway Supabase, i log, la retention pianificata e un ripristino nel progetto di test. I test PGlite non misurano la capacità multi-connessione del servizio ospitato.

La prova dispositivi comprende almeno un iPhone Safari, un Android Chrome di fascia media e un desktop con sola tastiera; usare anche un iPad Safari se sarà impiegato. Registrare modello, versione OS/browser, rete, commit e risultato. Provare QR stampato, refresh, rotazione, caratteri ingranditi, rete lenta, perdita della risposta dopo commit, share nativo annullato e download realmente aperto nella galleria/file.

Il percorso essenziale deve funzionare anche con movimento ridotto e navigazione da tastiera: ricerca etichettata, carte premibili, focus nel dialogo, Escape, ritorno al comando corretto, riepilogo testuale dei dati e messaggi comprensibili. Il controllo automatico di layout non sostituisce VoiceOver/TalkBack o una verifica visiva del contrasto e dell'ingrandimento.

## 6. Offline e aggiornamento

Il worker è generato dalla lista dei file della build e ha scope `/big-match/`. Precarica HTML, bundle, font e artwork locali. Un solo asset mancante impedisce l'installazione della nuova cache. Non gestisce richieste a Supabase, API, autenticazione, metodi diversi da GET, richieste autorizzate o `no-store`, né inserisce risposte dinamiche nella cache.

La prima visita richiede rete e installazione completa. Dopo un caricamento riuscito, il dispositivo può riaprire carte e poster senza rete. Una cancellazione dei dati del browser o l'espulsione della cache da parte del sistema richiede un nuovo caricamento online. Un telefono mai precaricato non può aprire l'app per la prima volta in modalità aereo.

La selezione e l'eventuale richiesta di partecipazione pendente sono conservate localmente; l'interfaccia distingue composizione locale, salvataggio confermato e dati temporaneamente indisponibili. Il worker non esegue sincronizzazioni in background. Il retry è un'azione esplicita e riusa lo stesso ID/payload per una risposta incerta. Le email del form non sono salvate nel worker o nello stato delle carte.

Una versione nuova attende. Il browser mostra un piccolo avviso; `UPDATE` invia `ACTIVATE_UPDATE` solo se non ci sono salvataggi, cancellazioni, export, tentativi pendenti o dati compilati nel form. Il worker non ricarica la pagina autonomamente. La pagina che conferma l'aggiornamento si ricarica dopo il cambio del controller. Le altre schede non ricevono un reload forzato. Restano la cache statica corrente e quella precedente; non vengono cancellate cache di altre app.

Provare due schede, form in corso, aggiornamento e rollback in staging. Conservare una versione della build scaricata: tenere una cache precedente sul dispositivo **non costituisce un rollback server**.

Questa implementazione non promette isolamento tra visitatori di un kiosk condiviso. Usare il QR sui telefoni personali. L'eventuale modalità kiosk richiede sessioni distinte, reset e autorizzazione propri prima di essere pubblicizzata.

## 7. Rollback

Per ogni release registrare commit, tag, run CI/Pages, versione in `build-info.json`, variabili pubbliche usate e compatibilità con la migrazione. Conservare l'artefatto compilato e il lockfile. I report con fixture non contengono dati di visitatori.

Se la release causa un blocco:

1. Identificare un artefatto/commit precedente già verificato e compatibile con API e catalogo attuali. Se il problema riguarda raccolta o privacy, il responsabile può prima chiudere l'evento con la procedura backend.
2. Ripubblicare la versione precedente mediante un nuovo tag di release sul relativo commit contenuto in `main`, con gli stessi gate. Per la prima migrazione dal vecchio HTML conservare separatamente l'artefatto legacy e la procedura Pages precedente: non tutti i commit storici contengono questo workflow.
3. Verificare l'URL `/big-match/`, `build-info.json`, percorso principale e servizi. Sui dispositivi già caricati attendere l'avviso di aggiornamento e confermare fuori da attività in corso. Provare anche una visita pulita.
4. Annotare causa, versione ripristinata e risultati. Non riscrivere la storia Git per mascherare il rilascio.

Il rollback del frontend non ripristina il database. Evitare downgrade SQL distruttivi; preferire correzioni compatibili. Un backup si ripristina prima nel progetto di test e deve rispettare cancellazioni e retention già effettuate, prima di riaprire dati al pubblico. La procedura di ripristino va provata dal responsabile, non soltanto descritta.

## 8. Go / no-go e monitoraggio minimo

**GO alla raccolta** soltanto con candidato identificato, CI completata, verifiche hosted e dispositivi reali completate, catalogo/informativa/date approvati, evento aperto, rollback disponibile e operatore per la gestione del catalogo quando il form è attivo.

Sono **NO-GO**: successo di salvataggio senza conferma, conteggi simulati o negativi, perdita/sovrascrittura silenziosa della risposta, accesso a dati di altri, credenziali private nell'artefatto, impossibilità di completare il percorso su uno dei dispositivi previsti, QR errato o pubblicazione Vite dal branch non compilato. Un problema del form può essere isolato tenendo `contact_enabled=false`; non dichiararlo disponibile fino a verifica dell'intero processo. La mappa, se esposta, richiede conteggi corretti e riepilogo leggibile. Le funzioni P1 diventano un gate P0 quando sono offerte al pubblico.

Gli indicatori già disponibili sono numero di risposte attive, frequenze delle carte/coppie e revisione del quadro pubblico. Si riferiscono a risposte/sessioni, non a persone uniche certificate. Per l'operatività osservare disponibilità, latenza/errori delle operazioni e richieste catalogo ricevute/evase attraverso strumenti privati del servizio. Non introdurre nomi, email, token o contenuto dei form nei log. Non è installato un tracker marketing o un servizio di analytics del visitatore.

Prima dell'apertura e a inizio giornata verificare caricamento dal QR, evento e catalogo corretti, backend raggiungibile, prova del percorso su dispositivo staff, spazio/rete e procedura di assistenza. Evitare invii periodici fittizi nell'evento pubblico: usare staging per i test che scrivono.
