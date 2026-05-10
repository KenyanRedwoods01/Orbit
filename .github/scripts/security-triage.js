const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.REPO.split("/");

/**
 * Fetch all alerts (CodeQL + Semgrep)
 */
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

/**
 * Create a stable grouping key
 */
function getGroupKey(alert) {
  return [
    alert.rule.id,
    alert.most_recent_instance.location.path,
    alert.tool.name,
  ].join("::");
}

/**
 * Group alerts
 */
function groupAlerts(alerts) {
  const groups = {};

  for (const alert of alerts) {
    const key = getGroupKey(alert);
    if (!groups[key]) groups[key] = [];
    groups[key].push(alert);
  }

  return groups;
}

/**
 * Build labels intelligently
 */
function buildLabels(alert) {
  const labels = ["security"];

  if (alert.rule.security_severity_level) {
    labels.push(`severity:${alert.rule.security_severity_level}`);
  }

  if (alert.tool?.name) {
    labels.push(`tool:${alert.tool.name.toLowerCase()}`);
  }

  if (alert.rule.id.includes("crypto")) {
    labels.push("category:crypto");
  }

  if (alert.rule.id.includes("exec") || alert.rule.id.includes("command")) {
    labels.push("category:command-injection");
  }

  if (alert.rule.id.includes("path")) {
    labels.push("category:path-traversal");
  }

  return labels;
}

/**
 * Fetch existing issues
 */
async function fetchExistingIssues() {
  const res = await octokit.request(
    "GET /repos/{owner}/{repo}/issues",
    {
      owner,
      repo,
      state: "open",
      labels: "security",
      per_page: 100,
    }
  );

  return res.data;
}

/**
 * Check if issue already exists
 */
function findExistingIssue(issues, groupKey) {
  return issues.find((issue) =>
    issue.body?.includes(groupKey)
  );
}

/**
 * Create issue
 */
async function createIssue(title, body, labels) {
  return octokit.request("POST /repos/{owner}/{repo}/issues", {
    owner,
    repo,
    title,
    body,
    labels,
  });
}

/**
 * Update issue (append new alerts)
 */
async function updateIssue(issueNumber, body) {
  return octokit.request(
    "PATCH /repos/{owner}/{repo}/issues/{issue_number}",
    {
      owner,
      repo,
      issue_number: issueNumber,
      body,
    }
  );
}

/**
 * MAIN LOGIC
 */
async function run() {
  const alerts = await fetchAlerts();
  const groups = groupAlerts(alerts);
  const existingIssues = await fetchExistingIssues();

  for (const key of Object.keys(groups)) {
    const group = groups[key];
    const first = group[0];

    const title = `🚨 ${first.rule.description}`;

    const alertList = group
      .map(
        (a) =>
          `- #${a.number} | ${a.state} | ${a.html_url}`
      )
      .join("\n");

    const body = `
## Security Group Key
${key}

## Rule
${first.rule.id}

## File
${first.most_recent_instance.location.path}

## Tool
${first.tool.name}

---

## Alerts
${alertList}
`;

    const labels = buildLabels(first);

    const existing = findExistingIssue(existingIssues, key);

    if (existing) {
      console.log(`Updating issue #${existing.number}`);
      await updateIssue(
        existing.number,
        existing.body + "\n\n---\n\n" + body
      );
    } else {
      console.log(`Creating issue: ${title}`);
      await createIssue(title, body, labels);
    }
  }

  console.log("Done security triage.");
}

run().catch(console.error);
