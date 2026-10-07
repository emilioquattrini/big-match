# BIG MATCH — bozza dell'informativa

**DRAFT — 7 ottobre 2026.** Documento da completare e verificare con il titolare prima della pubblicazione. Non è stato inserito nel campo pubblico `privacy_notice` e non apre la raccolta dei dati.

Per la fase con evento draft e raccolta disabilitata è disponibile un'[informativa specifica pre-evento](PRIVACY_PRE_EVENT.md). Il presente documento riguarda l'apertura delle partecipazioni e delle richieste catalogo, non viene sostituito dall'informativa dell'anteprima.

Il titolare indicato dall'utente è **Chiara Zhu**, con recapito **chiara.czhu@gmail.com**, confermato il 7 ottobre 2026 e registrato nella configurazione dell'evento `big-2026`. Nella stessa sessione l'utente ha confermato **30 giorni di conservazione** e **Chiara come responsabile dell'evasione manuale del catalogo**. Le regole temporali distinte sono riportate nel testo e nella tabella sotto.

## Decisioni da completare

- **Base giuridica:** il testo propone l'art. 6(1)(b) GDPR per la partecipazione e il catalogo effettivamente richiesti, e l'art. 6(1)(f) per le sole protezioni tecniche descritte. Prima di adottarlo, verificare i presupposti di un rapporto contrattuale valido, la necessità dei trattamenti e il bilanciamento per le protezioni tecniche. Queste valutazioni non risultano già approvate. La mera richiesta di un servizio non dimostra, da sola, tutti i presupposti dell'art. 6(1)(b). [1][2]
- **Conservazione dei fornitori:** i 30 giorni del database applicativo sono confermati. Registrare i periodi effettivi di log e backup dei servizi; la cancellazione applicativa non equivale alla rimozione immediata di ogni copia di backup.
- **Evasione del catalogo:** Chiara gestisce le richieste manualmente. Confermare il PDF e il servizio email usato per l'invio; applicare la [procedura operativa](CATALOGUE_OPERATIONS.md) anche alle copie esportate e nella posta. La pulizia SQL non cancella CSV scaricati o messaggi inviati manualmente.
- **Versione:** il recapito è confermato; assegnare `privacy_version` soltanto al testo definitivo.

Il checkbox del catalogo documenta la richiesta e la presa visione dell'informativa. La partecipazione si salva al terzo tap e non registra un consenso separato. Se si decidesse di basare la partecipazione sul consenso, occorrerebbe adeguare anche il flusso e la sua registrazione; cambiare soltanto il testo non sarebbe sufficiente.

## Testo inglese proposto per `privacyNotice`

Il frontend mostra questo campo come testo semplice, rispettando i capoversi. Nome del titolare, email e versione vengono aggiunti separatamente da `updatePrivacy()` in `src/main.ts`. Copiare soltanto il testo definitivo, senza la recinzione Markdown o le note interne del documento.

```text
Taking part in BIG MATCH

BIG MATCH is a voluntary activity about the future of design. When the event is open, choosing your third card submits your response. We use your card choices, changes, submission times and a randomly assigned browser identifier to save and update your response, calculate matches and display the collective results. You do not need to provide a name or email to participate. These data are used to provide the interactive service you request, under Article 6(1)(b) GDPR.

Public results show counts of card choices and combinations, without browser identifiers or contact details. Matching compares the selected cards; it does not make decisions with legal or similarly significant effects.

Requesting the catalogue

If you request the catalogue, we use your email address, optional name and request record to handle and fulfil that request, under Article 6(1)(b) GDPR. Your contact details are stored separately from your card choices. Providing an email is necessary to receive the catalogue; providing a name is optional. This is not a newsletter subscription.

Security and storage

We use limited technical records to restrict automated requests, protect the service and prevent deleted responses from being restored by delayed requests. This processing is based on our legitimate interest in those specific security purposes, under Article 6(1)(f) GDPR. App rate-limit identifiers are derived from network information, change daily and are removed after two days by the scheduled cleanup.

Your browser stores your selection and session so you can return to your response. These local copies remain until you delete them or clear the site's data. The app does not add advertising or audience-measurement tools.

How long we keep data

Individual responses, previous submissions and associated app identifiers are scheduled for deletion 30 days after the event ends. You can remove your card choices earlier using “Delete my participation”. A minimal technical record remains until the same expiry to prevent delayed requests from restoring them.

Catalogue requests are scheduled for deletion 30 days after they are received. Cleanup runs hourly. Aggregate event totals without browser identifiers or contact details may remain available. These periods apply to the active app database; hosting logs and rolling backups have separate retention periods.

Service providers

Authorised people helping Chiara Zhu operate the event and fulfil catalogue requests can access the data needed for those tasks. Supabase provides the database, authentication and backend services; the project database is in Frankfurt. GitHub Pages hosts the website and records visitors' IP addresses for security. Catalogue delivery also involves the email service used to send it.

Providers may process data outside the European Economic Area. Their published terms describe the applicable transfer safeguards, including standard contractual clauses. You can request details and copies of the applicable safeguards from the controller.

Your rights

Contact chiara.czhu@gmail.com to request access, correction, deletion or restriction of your data, and, where applicable, portability or to object to processing based on legitimate interests. Catalogue requests must be removed separately from your participation. If you have lost the browser session, we may need information that allows us to locate your response. You may also complain to the Italian data protection authority, Garante per la protezione dei dati personali, or another competent supervisory authority.
```

## Corrispondenza con l'applicazione

| Dato o azione | Comportamento implementato |
|---|---|
| Partecipazione | Invio al terzo tap quando la raccolta è aperta; sessione tecnica senza nome/email. |
| Richiesta catalogo | Email obbligatoria, nome facoltativo, versione dell'informativa registrata; nessun invio email automatico. |
| Risposte e ricevute | Pulizia a fine evento più `retention_days`, attualmente 30. |
| Cancellazione anticipata | Rimuove scelte e vecchi payload; conserva un segnale tecnico fino alla scadenza per respingere invii tardivi. |
| Richieste catalogo | Pulizia dalla data della richiesta più `retention_days`; ripetere la stessa email non rinnova automaticamente la prima richiesta. |
| Limiti applicativi | Identificatori derivati giornalmente; finestre più vecchie di due giorni rimosse dalla pulizia oraria. |
| Browser | Selezione e sessione locali senza una scadenza automatica comune di 30 giorni. |
| Aggregati | Restano disponibili senza identificativi degli attori o contatti dopo la pulizia delle risposte. |

Riferimenti nel repository: `index.html`, `src/main.ts`, `src/storage.ts`, `supabase/functions/big-match/handler.ts`, `supabase/migrations/20261006232008_big_match.sql` e `supabase/migrations/20261006232718_big_match_retention_schedule.sql`. La nota breve con il collegamento all'informativa è stata spostata prima delle carte, esplicitando l'invio al terzo tap.

## Fonti primarie

Consultate il 7 ottobre 2026. Le fonti descrivono requisiti e condizioni dei fornitori; la corrispondenza con il trattamento proposto richiede le decisioni indicate sopra.

1. [Regolamento (UE) 2016/679](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679), artt. 6 e 13 e diritti degli interessati.
2. [EDPB — Guidelines 2/2019 sull'art. 6(1)(b)](https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines-art_6-1-b-adopted_after_public_consultation_en.pdf), in particolare §§ 17–20 e 26–27.
3. [Supabase — Data Processing Addendum](https://supabase.com/legal/customer-resources/data-processing-addendum), regione selezionata, fornitura del servizio e trasferimenti.
4. [GitHub Pages — Data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), registrazione degli IP per sicurezza.
5. [GitHub — General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), conservazione e trasferimenti internazionali.
