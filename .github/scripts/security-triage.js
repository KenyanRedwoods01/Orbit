const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.REPO.split("/");

// ----------------------------
// FETCH ALERTS
// ----------------------------
async function fetchAlerts() {
  const res = await octokit.request(
    "GET /repos/{owner}/{repo}/code-scanning/alerts",
    {
      owner,
      repo,
      per_page: 100,
    }
  );

  return res.data;
}

// ----------------------------
// SEMANTIC GROUPING (LIGHT AI)
// ----------------------------
function semanticGroup(alert) {
  const text = (
    alert.rule.description +
    " " +
    alert.rule.id
  ).toLowerCase();

  if (text.includes("path")) return "path-traversal";
  if (text.includes("exec") || text.includes("command")) return "command-injection";
  if (text.includes("ssl") || text.includes("tls")) return "crypto-misconfig";
  if (text.includes("sql")) return "sql-injection";

  return "other";
}

// ----------------------------
// LABELS
// ----------------------------
function buildLabels(alert) {
  const labels = ["security"];

  if (alert.rule.security_severity_level) {
    labels.push(`severity:${alert.rule.security_severity_level}`);
  }

  if (alert.tool?.name) {
    labels.push(`tool:${alert.tool.name.toLowerCase()}`);
  }

  const group = semanticGroup(alert);
  labels.push(`category:${group}`);

  return labels;
}

// ----------------------------
// SLA RULES
// ----------------------------
function getSLA(alert) {
  const severity = alert.rule.security_severity_level;

  const hours =
    severity === "critical" ? 24 :
    severity === "high" ? 72 :
    severity === "medium" ? 168 : 720;

  const due = new Date(Date.now() + hours * 3600000);

  return due.toISOString().split("T")[0];
}

// ----------------------------
// GROUP ALERTS
// ----------------------------
function groupAlerts(alerts) {
  const groups = {};

  for (const alert of alerts) {
    const key =
      semanticGroup(alert) +
      "::" +
      alert.most_recent_instance.location.path +
      "::" +
      alert.tool.name;

    if (!groups[key]) groups[key] = [];
    groups[key].push(alert);
  }

  return groups;
}

// ----------------------------
// GET ISSUES
// ----------------------------
async function getIssues() {
  const res = await octokit.request(
    "GET /repos/{owner}/{repo}/issues",
    {
      owner,
      repo,
      state: "open",
      per_page: 100,
    }
  );

  return res.data;
}

// ----------------------------
// CREATE ISSUE
// ----------------------------
async function createIssue(title, body, labels) {
  return octokit.request(
    "POST /repos/{owner}/{repo}/issues",
    {
      owner,
      repo,
      title,
      body,
      labels,
    }
  );
}

// ----------------------------
// AUTO FIX ENGINE (SAFE ONLY)
// ----------------------------
function generateFix(alert) {
  const rule = alert.rule.id;

  if (rule.includes("missing-ssl-minversion")) {
    return `
tlsConfig := &tls.Config{
  MinVersion: tls.VersionTLS12,
}
`;
  }

  if (rule.includes("dangerous-exec")) {
    return `
// FIX: Replace exec with whitelist-based execution
// DO NOT use raw user input
`;
  }

  if (rule.includes("path")) {
    return `
cleanPath := filepath.Clean(userInput)
`;
  }

  return null;
}

// ----------------------------
// MAIN
// ----------------------------
async function run() {
  const alerts = await fetchAlerts();
  const groups = groupAlerts(alerts);
  const issues = await getIssues();

  for (const key of Object.keys(groups)) {
    const group = groups[key];
    const first = group[0];

    const labels = buildLabels(first);
    const sla = getSLA(first);

    const body = `
## 🚨 Security Group
${key}

## Rule
${first.rule.id}

## File
${first.most_recent_instance.location.path}

## Tool
${first.tool.name}

## SLA Due
${sla}

---

## Alerts
${group
  .map((a) => `- #${a.number} | ${a.state} | ${a.html_url}`)
  .join("\n")}

---

## Suggested Fix
\`\`\`go
${generateFix(first) || "No safe auto-fix available"}
\`\`\`
`;

    // dedupe (simple match)
    const exists = issues.find(i => i.body?.includes(key));

    if (!exists) {
      await createIssue(
        `🚨 ${first.rule.description}`,
        body,
        labels
      );
    }
  }

  console.log("Security triage complete.");
}

run().catch(console.error);
