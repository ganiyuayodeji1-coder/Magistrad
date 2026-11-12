# Azure infrastructure (UK South + UK West)

Terraform for one Magistrad environment. **Written and validated, not yet deployed**: deploying
needs an Azure subscription and a decision on the identity provider.

| Area | What is defined |
| --- | --- |
| Network | Virtual network; database and storage reachable only through private networking |
| Database | PostgreSQL 16, zone-redundant HA, 35-day point-in-time recovery, geo-redundant backups (UK West), TLS 1.2+, no public access |
| Documents | Storage account with geo-redundant copy in UK West, customer-managed HSM key, no shared keys, no public access, versioning; containers per space kind; write-once (WORM) policy on `record` and `audit-checkpoints` |
| Secrets | Key Vault (premium/HSM), RBAC only, purge protection, deny-by-default network rules |
| Apps | Container Apps: the API has no public ingress; only the web app is public |
| Identity | Managed identity for the API; no storage keys or connection secrets in code |

Still to add before a pilot (tracked in the roadmap): Front Door with WAF and rate limiting in front of the web app,
Microsoft Defender for Storage malware scanning, alerting rules, and a CI/CD pipeline that builds images and runs
`pnpm db:migrate` with the owner credential from Key Vault.

```bash
terraform init -backend-config=env/dev.backend.hcl
terraform plan -var-file=env/dev.tfvars
```
