<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into your Firebase Cloud Functions backend (`functions/index.js`). The `posthog-node` SDK was installed and initialized using environment variables. Three events are now tracked across both Cloud Functions, with customer identification and exception capture included.

| Event | Description | File |
|---|---|---|
| `order_confirmed` | Fired when a new customer order is created and confirmation emails are successfully sent. Includes order number, pickup location, estimated total, box count, and item count. The customer is also identified (name, email, phone) at this point. | `functions/index.js` |
| `reminder_emails_sent` | Fired when an admin sends a batch of pickup reminder emails. Includes sent count, skipped count, and total attempted. Distinct ID is the admin's email/uid. | `functions/index.js` |
| `reminder_email_skipped` | Fired for each individual order skipped during a reminder send (reasons: `missing`, `not_active`, `missing_email`, `send_failed`). Useful for diagnosing delivery issues. | `functions/index.js` |

Exception capture via `posthog.captureException()` was added to the reminder email send error handler.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](https://us.posthog.com/project/409686/dashboard/1543847)
- [Total Orders Confirmed (30d)](https://us.posthog.com/project/409686/insights/ol9HZMm1) — bold number showing total orders in the last 30 days
- [Orders Confirmed Over Time](https://us.posthog.com/project/409686/insights/bC0mDUtP) — daily order volume trend
- [Unique Customers Ordering](https://us.posthog.com/project/409686/insights/xVshdbVZ) — daily unique customer trend
- [Estimated Order Revenue Over Time](https://us.posthog.com/project/409686/insights/JMIKCpn9) — sum of estimated order totals per day
- [Reminder Emails Sent Over Time](https://us.posthog.com/project/409686/insights/TekKzktZ) — reminder batches sent vs. orders skipped

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-javascript_node/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
