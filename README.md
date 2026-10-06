# BIG MATCH — Impersonae × BIG Milano

Web app per scegliere tre carte Impersonae, creare la propria Story e scoprire connessioni con le risposte raccolte durante l'evento.

## Scelte confermate

- **13 carte originali**, con ID stabili e catalogo ampliabile.
- Percorso principale sui **telefoni dei visitatori**.
- Una risposta attiva per browser/evento; cambiare le carte aggiorna la risposta.
- Partecipazione senza nome, email o password pubblica, attraverso una sessione tecnica anonima.
- **Sola richiesta del catalogo**, facoltativa e separata dalle scelte; nessuna newsletter.
- Interfaccia inglese e identità grafica originale, con correzioni a contrasto, tastiera e focus.

## Stato dell'implementazione

Il codice comprende frontend, schema PostgreSQL, Edge API, test e procedura di rilascio. Il seed è volutamente vuoto di partecipazioni e crea l'evento **draft**, con raccolta disabilitata. L'attivazione richiede un progetto Supabase configurato, informativa/titolare reali e verifica dell'evento.

Lo stato delle verifiche e delle dipendenze esterne al momento della consegna è registrato in [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

**Non unire il ramo di sviluppo in `main` mentre GitHub Pages usa ancora “Deploy from a branch”.** Prima impostare Pages Source su **GitHub Actions** seguendo [RELEASE.md](docs/RELEASE.md): il nuovo `index.html` è sorgente Vite e deve essere compilato. Il workflow di produzione pubblica soltanto `dist/`, con controlli sul backend e un'attivazione esplicita. Il sito esistente resta il riferimento pubblico finché il rilascio non è pronto.

Senza configurazione dati l'app consente di esplorare le carte, creare e scaricare la composizione. Mostra che la community è indisponibile: **non genera numeri di visitatori e non conferma contatti non salvati**.

## Avvio locale

Richiede Node.js 24 e npm. Versioni delle dipendenze bloccate in `package-lock.json`.

```sh
npm ci
npm run dev
```

Il percorso predefinito è `http://localhost:5173/big-match/`. Per ambienti che non consentono l'enumerazione delle interfacce di rete:

```sh
npm run dev -- --host 127.0.0.1
```

Per collegare un progetto di sviluppo, copiare `.env.example` in `.env.local` e impostare:

```dotenv
VITE_APP_BASE=/big-match/
VITE_EVENT_SLUG=big-2026
VITE_APP_URL=https://emilioquattrini.github.io/big-match/
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

Le variabili `VITE_*` finiscono nel browser. Inserire **soltanto la chiave pubblicabile**; nessuna chiave segreta o `service_role`. Le credenziali del server si configurano separatamente su Supabase. I file `.env` privati sono ignorati da Git.

## Backend

La guida completa è [BACKEND.md](docs/BACKEND.md). Contiene installazione, controlli dei ruoli, segreti server, apertura evento, richieste catalogo, limiti Auth e conservazione.

1. Applicare la migrazione in `supabase/migrations/` e il seed una sola volta nel progetto corretto.
2. Configurare le sessioni anonime e le quote per i telefoni e la rete dell'evento.
3. Distribuire la funzione `big-match` e impostare origini ammesse e segreto dei limiti di traffico.
4. Completare titolare, contatto, informativa/versione, date e abilitazione raccolta.
5. Abilitare la richiesta catalogo quando lo studio può gestire le richieste ricevute.
6. Configurare e provare la procedura di conservazione, backup e ripristino.

Le tabelle sono private. Le funzioni RPC non sono eseguibili dai ruoli dei browser; l'Edge verifica l'identità con Supabase Auth e passa al database esclusivamente l'UID verificato. I contatti hanno una rotta pubblica con limiti dedicati e non creano un profilo Auth.

**CAPTCHA:** il client iniziale non esegue una challenge. Non attivare il requisito CAPTCHA in Supabase Auth senza integrare prima il relativo token client; altrimenti nessun visitatore potrà aprire una sessione. Quote, limiti server e prova del Wi-Fi vanno verificati prima della raccolta pubblica. La configurazione iniziale non abilita CAPTCHA di nascosto.

## Regole del matching

- **Exact:** un'altra risposta contiene le stesse tre carte, in qualunque ordine.
- **Close:** un'altra risposta condivide esattamente due carte.
- Il proprietario viene escluso; un exact non è contato anche come close.
- La mappa pubblica contiene solo frequenze di carte/coppie, totale e orario/versione dello snapshot.
- Il numero sul poster identifica una combinazione. Non è l'identificativo di una persona.
- Un link condiviso è di sola lettura: aprirlo non registra una nuova risposta.

Il test `ABC, ABC, ABD, ACD, BCD, AEF, DEF` restituisce, per il primo `ABC`, **exact 1 / close 3**. Tutte le 286 combinazioni attuali e le 22.100 di un'estensione a 52 carte hanno codici distinti; aggiungere ID successivi non cambia i codici esistenti.

## Aggiungere carte

Le immagini sono in `public/cards/`; il catalogo è [catalog/impersonae-v1.json](catalog/impersonae-v1.json). Aggiungere l'immagine e una voce con il successivo ID stabile; non rinumerare o riutilizzare gli ID esistenti. Aggiornare l'elenco di carte ammesse nell'evento secondo [CATALOG.md](docs/CATALOG.md). Un evento che ha già raccolto risposte conserva il proprio catalogo: per una nuova edizione si prepara un nuovo evento.

Il logo e le tredici immagini originali sono stati estratti dall'HTML originale senza ricodifica. Provenienza e hash sono documentati nella guida del catalogo.

## Story e condivisione

`src/poster.ts` crea un PNG **1080 × 1920** con canvas dedicato, font locale e arte non ritagliata. La composizione della pagina non viene modificata durante l'esportazione. Il file viene preparato prima del gesto di condivisione, che usa un unico gestore. Se il sistema non supporta la condivisione del file, sono disponibili link e download.

Il successo del pannello nativo non viene presentato come prova della pubblicazione su un social. Il download è annunciato come avviato, senza promettere un salvataggio che il browser non può verificare.

## Connessione e dati locali

L'app conserva la scelta e l'identità di un eventuale salvataggio da ritentare. Una richiesta accettata può essere ripetuta senza duplicare la partecipazione. Le revisioni impediscono a una scheda rimasta indietro di sovrascrivere una risposta più recente. Le risposte asincrone obsolete vengono scartate nell'interfaccia.

La cache offline comprende soltanto i file statici dell'app, sotto il suo percorso. Non conserva API, contatti o risultati personali. Gli aggiornamenti non ricaricano automaticamente una compilazione in corso. Il primo accesso a un telefono completamente offline richiede comunque una connessione.

L'iPad può usare lo stesso percorso personale. Una postazione condivisa con un nuovo visitatore per ogni turno richiede la modalità kiosk dedicata: non usare un semplice aggiornamento pagina per fingere una nuova persona.

## Verifiche

```sh
npm run typecheck
npm test
npm run test:sw
npm run build
npm run check:release
```

I test backend eseguono migrazioni e RPC su PostgreSQL tramite PGlite. Nei test HTTP il servizio Auth è simulato, mentre le operazioni SQL sono reali. Questo verifica la logica; non misura il carico concorrente di un progetto Supabase ospitato.

Per le regressioni browser, usare esclusivamente un build locale con le configurazioni e fixture descritte in [ACCEPTANCE.md](docs/ACCEPTANCE.md):

```sh
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

La suite blocca le origini esterne e non invia dati a un evento reale. La CI produce report, screenshot e prova delle dimensioni del PNG. I test sui browser emulati non sostituiscono la prova finale su iPhone e Android fisici.

## Documentazione operativa

- [Contratto delle API](docs/API_CONTRACT.md)
- [Backend, dati e contatti](docs/BACKEND.md)
- [Catalogo e aggiunta carte](docs/CATALOG.md)
- [Rilascio, configurazione Pages e ripristino](docs/RELEASE.md)
- [Criteri di accettazione e limiti delle verifiche](docs/ACCEPTANCE.md)

Il vecchio ZIP nel repository è un archivio della versione iniziale: non è il sorgente della nuova app. La versione corrente si costruisce sempre dai file versionati con `npm run build`.
