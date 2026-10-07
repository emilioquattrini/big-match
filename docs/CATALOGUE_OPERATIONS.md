# BIG MATCH — gestione delle richieste catalogo

Responsabile confermata il 7 ottobre 2026: **Chiara Zhu**. Recapito del titolare: **chiara.czhu@gmail.com**. L'invio è manuale; il form salva una richiesta e non manda email automaticamente.

## Preparazione

Prima di abilitare il form, preparare il PDF definitivo e scegliere la casella da cui inviarlo. Il recapito del titolare non configura automaticamente un account di spedizione nell'app. Chiara deve poter consultare le richieste con un accesso autorizzato al progetto Supabase; non occorre distribuire chiavi server.

Durante la fiera è consigliato controllare le nuove richieste almeno a fine giornata e proseguire fino all'evasione di quelle ancora pendenti. Questa frequenza è una proposta organizzativa, non una notifica automatica o una promessa mostrata al visitatore.

## Consultare le richieste

Nel SQL Editor del progetto **Big Match** eseguire la query seguente. Il filtro `big-2026` esclude gli eventi di collaudo. L'elenco contiene dati personali e va consultato privatamente.

```sql
SELECT r.id, r.email, r.name, r.created_at,
       r.created_at + make_interval(days => e.retention_days) AS expires_at
FROM big_match_contacts.requests AS r
JOIN big_match.events AS e ON e.id = r.event_id
WHERE e.slug = 'big-2026'
  AND r.status = 'received'
ORDER BY r.created_at;
```

Inviare il catalogo richiesto individualmente, evitando di rendere visibili indirizzi di altri visitatori. Non aggiungere il destinatario a una newsletter. In caso di errore di consegna, mantenere la richiesta da gestire e verificare l'indirizzo prima di segnare un invio completato.

## Registrare un invio completato

Solo dopo aver inviato il PDF, copiare l'ID della richiesta verificata nella query. `UUID_DELLA_RICHIESTA` è un segnaposto da sostituire, non una query pronta da eseguire invariata. La condizione sullo stato evita di riscrivere la data di un invio già registrato.

```sql
UPDATE big_match_contacts.requests AS r
SET status = 'fulfilled', fulfilled_at = now()
FROM big_match.events AS e
WHERE e.id = r.event_id
  AND e.slug = 'big-2026'
  AND r.id = 'UUID_DELLA_RICHIESTA'::uuid
  AND r.status = 'received'
RETURNING r.id, r.status, r.fulfilled_at;
```

## Conservazione e richieste di cancellazione

Il periodo scelto è **30 giorni dalla ricezione della richiesta**, anche se viene evasa prima. Il processo orario elimina la richiesta e le sue ricevute dal database applicativo una volta superata la scadenza. Una richiesta ripetuta con la stessa email non rinnova automaticamente la data della prima.

Lavorare direttamente sull'elenco privato riduce le copie da gestire. Se serve un'esportazione, conservarla in un'area privata, trattare i campi come testo quando si apre un CSV in un foglio di calcolo ed eliminarla appena terminato l'uso, comunque entro la scadenza delle richieste contenute. Non aggiungerla al repository pubblico. Anche le copie dei contatti presenti nella posta usata per gli invii richiedono gestione manuale: la pulizia SQL non le raggiunge.

La cancellazione della partecipazione nell'app riguarda le carte, mentre i contatti del catalogo sono separati. Gestire una richiesta sui contatti tramite il recapito del titolare, identificando la sola richiesta interessata e le sue eventuali copie. Testo definitivo dell'informativa e periodi dei servizi di posta, log e backup devono restare coerenti con questa procedura.

La [guida backend](BACKEND.md) descrive schema, accessi e pulizia; la [bozza dell'informativa](PRIVACY_NOTICE_DRAFT.md) distingue ciò che è confermato dai punti da completare prima della pubblicazione.
