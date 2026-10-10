# Security policy

## Reporting vulnerabilities

Do not open a public issue containing credentials, customer data, medical/business records, or exploitable details. Report privately to the deployment owner and include reproduction steps, affected endpoint, impact, and any suggested mitigation.

## Production requirements

- Use unique high-entropy values for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- Serve the API and frontend over HTTPS; configure a restrictive CORS allowlist.
- Run MongoDB on a private network with authentication and encrypted transport where appropriate.
- Keep uploaded files outside the public web root. Use a malware-scanning hook before enabling public downloads in a high-risk deployment.
- Rotate refresh tokens and revoke sessions after suspected compromise.
- Configure a real transactional email provider for password resets and approvals.
- Complete legal, privacy, tax, and jurisdiction-specific invoice review before production use.

Supply Medicals manages business distribution records. It does not diagnose patients or recommend medical treatment.
