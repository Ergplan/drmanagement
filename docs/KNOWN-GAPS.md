# Known gaps

| Gap | Until |
|---|---|
| Real meters commissioned on site (drivers built and tested only against simulators) | Site survey + point list + gateway access |
| Building floor uses and geometry are modelled, not as-built | Site survey and drawings |
| OpenADR certification (VEN is functional, not certified) | When a DISCOM programme requires it |
| SSO; multi-site onboarding UI | After v1.0 |
| HIS feed for occupancy/OT/imaging bookings (simulated now) | Hospital IT integration |
| Contacts for Globe roles ([NAME], [PHONE]); built-up area | From hospital |
| Address: website A-4-5 Nirala Nagar vs agreement/bills A-3 | Confirm with hospital |
| Database availability depends on the VM (single instance, no replica) | Stage 8 adds nightly backups to Cloud Storage; a replica if the pilot goes live |
| Port 5432 reachable from the internet (TLS + SCRAM only) | Narrow when Vercel Static IPs or a private tunnel are adopted |
| Oct 2026 bill total is ₹7,000 above its energy + demand + FPPAS + duty lines (another charge not in the extract) | Check the bill's other-charges line |
| DLMS (IS 15959) for the MVVNL meter, BACnet/IP for the BMS, OCPP for EV chargers, MQTT gateways | Stage 7 real-driver harness |
| Summer daily load shape is fitted with a strong evening factor; daily totals and peaks match bills | Re-fit from real meter data |
| Dec–Apr and Oct energy targets are assumptions (no bill / disputed bill) | Load the hospital's other bills |
| Duty engineer reachability is a manual edge setting, not a paging check | Stage 7 notifications with acknowledgement |
| Event blockers (mass-casualty alert, OT list overrun, fire alarm, outdoor > 44 °C, MS hold) are listed but not yet wired as inputs | HIS/BMS integration; MS hold button in Stage 5 |
| Local abort at the edge without the cloud (a physical or local web button) | Stage 7 gateway UI |
| DB tests write rows into append-only tables; run them only against a test database, never the VM production database | Stage 8 adds a separate test database on the VM |
| WhatsApp/SMS adapters (console until a provider and keys exist) | Provider choice with the hospital |
| Per-m² intensity needs the built-up area | From hospital |
| Occupancy-normalised kWh per occupied bed-day needs the HIS census feed | HIS integration |
| Baseline adjustment for temperature and OT load (agreement clause 2.1 (d)) beyond the same-day level factor | After a summer of real meter data |
| Event settlement and the monthly PDF from production need the VM database, the edge with its pdf service, and CRON_SECRET in Vercel | User runs the VM setup (docs/vm/SETUP.md) |
| Street View frame rate measured only under software WebGL (SwiftShader, no GPU in the build box): 110–210 ms a frame; the 60 fps laptop / 30 fps phone target needs a GPU measurement with ?bench=1 | User or Stage 8 on real hardware |
| Street View: no baked AO, KTX2/Draco or LOD yet (no imported models to compress; geometry is procedural and light) | When CC0 models are added |
| Screen recording of the tour for the stage report | Needs a GPU browser session |
