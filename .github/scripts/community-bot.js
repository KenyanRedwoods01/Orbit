/**
 * Orbit Community Bot — Core Script
 *
 * Handles:
 *  - Dependabot alert → issue creation / auto-close
 *  - CI failure → issue creation / auto-close
 *  - PR size + path labeling
 *  - Contributor recognition (first PR, milestone badges)
 *  - Daily security sweep (re-open still-vulnerable issues)
 *
 * Usage: called by GitHub Actions via `actions/github-script@v7`
 *        Pass `ACTION` env var to select which handler runs.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_EMOJI = {
  critical: "🔴",
  high:     "🟠",
  moderate: "🟡",
  medium:   "🟡",
  low:      "🟢",
  unknown:  "⚪",
};

function severityEmoji(sev) {
  return SEVERITY_EMOJI[(sev || "").toLowerCase()] || "⚪";
}

async function findOpenIssueByLabel(github, context, label, bodyFragment) {
  const issues = await github.rest.issues.listForRepo({
    owner: context.repo.owner,
    repo:  context.repo.repo,
    labels: label,
    state:  "open",
    per_page: 100,
  });
  if (!bodyFragment) return issues.data;
  return issues.data.filter(i => i.body && i.body.includes(bodyFragment));
}

async function createIssue(github, context, { title, body, labels }) {
  return github.rest.issues.create({
    owner:  context.repo.owner,
    repo:   context.repo.repo,
    title,
    body,
    labels,
  });
}

async function closeIssue(github, context, issueNumber, comment) {
  if (comment) {
    await github.rest.issues.createComment({
      owner:        context.repo.owner,
      repo:         context.repo.repo,
      issue_number: issueNumber,
      body:         comment,
    });
  }
  await github.rest.issues.update({
    owner:        context.repo.owner,
    repo:         context.repo.repo,
    issue_number: issueNumber,
    state:        "closed",
    state_reason: "completed",
  });
}

async function reopenIssue(github, context, issueNumber, comment) {
  if (comment) {
    await github.rest.issues.createComment({
      owner:        context.repo.owner,
      repo:         context.repo.repo,
      issue_number: issueNumber,
      body:         comment,
    });
  }
  await github.rest.issues.update({
    owner:        context.repo.owner,
    repo:         context.repo.repo,
    issue_number: issueNumber,
    state:        "open",
  });
}

// ── Handler: Sync Dependabot alerts → issues ──────────────────────────────────

async function syncDependabotAlerts(github, context) {
  console.log("🔍 Fetching open Dependabot alerts…");

  let alerts;
  try {
    const res = await github.rest.dependabot.listAlertsForRepo({
      owner:    context.repo.owner,
      repo:     context.repo.repo,
      state:    "open",
      per_page: 100,
    });
    alerts = res.data;
  } catch (err) {
    console.log(`⚠️  Could not fetch Dependabot alerts: ${err.message}`);
    console.log("   (Repository may need Dependabot alerts enabled in Settings → Security)");
    return;
  }

  if (!alerts.length) {
    console.log("✅ No open Dependabot alerts.");
    return;
  }

  const existing = await findOpenIssueByLabel(github, context, "dependabot-alert");
  const existingTitles = new Set(existing.map(i => i.title));

  let created = 0;
  for (const alert of alerts) {
    const adv  = alert.security_advisory || {};
    const vuln = (adv.vulnerabilities || [])[0] || {};
    const pkg  = vuln.package || alert.dependency?.package || {};
    const sev  = adv.severity || alert.security_vulnerability?.severity || "unknown";
    const cve  = adv.cve_id || "N/A";
    const patchedVer = vuln.first_patched_version?.identifier || "No patch available";
    const affectedRange = vuln.vulnerable_version_range || "unknown";
    const manifest = alert.dependency?.manifest_path || "unknown";

    const title = `[Dependabot] ${adv.summary || `Vulnerability in ${pkg.name}`}`;

    if (existingTitles.has(title)) {
      console.log(`  ↩️  Already tracked: ${title}`);
      continue;
    }

    const emoji = severityEmoji(sev);
    const body = [
      `## ${emoji} Dependabot Security Alert`,
      ``,
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Package** | \`${pkg.name || "unknown"}\` (${pkg.ecosystem || "unknown"}) |`,
      `| **Severity** | ${emoji} ${sev.toUpperCase()} |`,
      `| **CVE** | ${cve} |`,
      `| **Affected versions** | \`${affectedRange}\` |`,
      `| **Patched version** | \`${patchedVer}\` |`,
      `| **Manifest** | \`${manifest}\` |`,
      ``,
      `### Description`,
      adv.description || "_No description provided._",
      ``,
      `### Fix Instructions`,
      `Update \`${pkg.name}\` to version \`${patchedVer}\` or later.`,
      ``,
      patchedVer !== "No patch available"
        ? `Run the appropriate update command for your package manager.`
        : `> ⚠️ No patch is currently available. Monitor the advisory for updates.`,
      ``,
      `### References`,
      ...(adv.references || []).map(r => `- ${r.url}`),
      ``,
      `---`,
      `_Auto-created by [Orbit Community Bot](/.github/assets/community-bot-logo.svg). This issue will auto-close when a PR updating \`${pkg.name}\` is merged._`,
    ].join("\n");

    await createIssue(github, context, {
      title,
      body,
      labels: ["dependabot-alert", "security", "auto-tracked", sev.toLowerCase()],
    });

    console.log(`  ✅ Created issue: ${title}`);
    existingTitles.add(title);
    created++;
  }

  console.log(`\n📊 Done. Created ${created} new alert issue(s).`);
}

// ── Handler: Close fixed Dependabot alert issues on PR merge ──────────────────

async function closeFixedAlertIssues(github, context) {
  const pr = context.payload.pull_request;
  if (!pr || !pr.merged) return;

  console.log(`🔍 Checking if PR #${pr.number} fixes tracked Dependabot issues…`);

  const openAlertIssues = await findOpenIssueByLabel(github, context, "dependabot-alert");
  if (!openAlertIssues.length) {
    console.log("  No open Dependabot alert issues to close.");
    return;
  }

  const filesRes = await github.rest.pulls.listFiles({
    owner:       context.repo.owner,
    repo:        context.repo.repo,
    pull_number: pr.number,
    per_page:    100,
  });
  const changedFiles = filesRes.data.map(f => f.filename);
  const depFiles = ["go.mod", "go.sum", "web/package.json", "web/package-lock.json", "web/pnpm-lock.yaml"];
  const touchedDepFiles = changedFiles.filter(f => depFiles.some(d => f.endsWith(d)));

  if (!touchedDepFiles.length) {
    console.log("  PR did not modify dependency files — skipping.");
    return;
  }

  let closed = 0;
  for (const issue of openAlertIssues) {
    const matched = touchedDepFiles.some(f => issue.body && issue.body.includes(f));
    if (matched) {
      const comment = [
        `✅ **Auto-closed by Orbit Community Bot**`,
        ``,
        `PR #${pr.number} updated dependency files that resolve this alert.`,
        ``,
        `**Merged PR:** ${pr.html_url}`,
        `**Merged by:** @${pr.merged_by?.login || "unknown"}`,
        ``,
        `_If the vulnerability is still present after this update, the daily security sweep will re-open this issue._`,
      ].join("\n");

      await closeIssue(github, context, issue.number, comment);
      console.log(`  ✅ Closed #${issue.number}: ${issue.title}`);
      closed++;
    }
  }

  console.log(`\n📊 Done. Closed ${closed} alert issue(s).`);
}

// ── Handler: Create issue for CI failure ──────────────────────────────────────

async function createCIFailureIssue(github, context) {
  const run = context.payload.workflow_run;
  if (!run || run.conclusion !== "failure") return;

  console.log(`❌ CI failure detected: ${run.name} on ${run.head_branch}`);

  const existingIssues = await findOpenIssueByLabel(
    github, context, "ci-failure", `Run ID: ${run.id}`
  );
  if (existingIssues.length) {
    console.log(`  Already tracked as issue #${existingIssues[0].number}`);
    return;
  }

  const body = [
    `## ❌ CI Failure: ${run.name}`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Workflow** | ${run.name} |`,
    `| **Run ID** | ${run.id} |`,
    `| **Branch** | \`${run.head_branch}\` |`,
    `| **Commit** | \`${run.head_sha}\` |`,
    `| **Triggered by** | @${run.triggering_actor?.login || "unknown"} |`,
    `| **Started at** | ${run.created_at} |`,
    ``,
    `### Logs`,
    `[View full workflow run](${run.html_url})`,
    ``,
    `### Next Steps`,
    `1. Click the link above to view the failure logs`,
    `2. Identify the failing step and fix the issue`,
    `3. Push a new commit — this issue will auto-close when CI passes`,
    ``,
    `---`,
    `_Auto-created by [Orbit Community Bot](/.github/assets/community-bot-logo.svg). This issue auto-closes when CI passes on \`${run.head_sha}\`._`,
  ].join("\n");

  const issue = await createIssue(github, context, {
    title:  `❌ CI Failure: ${run.name} (${run.head_branch})`,
    body,
    labels: ["ci-failure", "auto-bot", "priority-high"],
  });

  console.log(`  ✅ Created issue #${issue.data.number}`);
}

// ── Handler: Close CI failure issue on success ────────────────────────────────

async function closeCIFailureIssue(github, context) {
  const run = context.payload.workflow_run;
  if (!run || run.conclusion !== "success") return;

  console.log(`✅ CI passed: ${run.name} on ${run.head_branch}`);

  const openFailureIssues = await findOpenIssueByLabel(github, context, "ci-failure");
  let closed = 0;

  for (const issue of openFailureIssues) {
    if (issue.body && issue.body.includes(`\`${run.head_sha}\``)) {
      const comment = [
        `✅ **Auto-closed by Orbit Community Bot**`,
        ``,
        `CI passed for commit \`${run.head_sha}\`.`,
        ``,
        `**Successful run:** ${run.html_url}`,
      ].join("\n");

      await closeIssue(github, context, issue.number, comment);
      console.log(`  ✅ Closed #${issue.number}`);
      closed++;
    }
  }

  if (!closed) console.log("  No matching CI failure issues to close.");
}

// ── Handler: Daily security sweep ─────────────────────────────────────────────

async function dailySecuritySweep(github, context) {
  console.log("🛡️  Running daily security sweep…");

  let currentAlerts;
  try {
    const res = await github.rest.dependabot.listAlertsForRepo({
      owner:    context.repo.owner,
      repo:     context.repo.repo,
      state:    "open",
      per_page: 100,
    });
    currentAlerts = res.data;
  } catch {
    console.log("⚠️  Cannot read Dependabot alerts — skipping CVE re-open check.");
    currentAlerts = [];
  }

  const currentCVEs = new Set(
    currentAlerts
      .map(a => a.security_advisory?.cve_id)
      .filter(Boolean)
  );

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const closedIssues = await github.rest.issues.listForRepo({
    owner:    context.repo.owner,
    repo:     context.repo.repo,
    labels:   "dependabot-alert",
    state:    "closed",
    since:    sevenDaysAgo,
    per_page: 100,
  });

  let reopened = 0;
  for (const issue of closedIssues.data) {
    const labels = issue.labels.map(l => l.name);
    if (labels.includes("wontfix")) continue;

    for (const cve of currentCVEs) {
      if (issue.body && issue.body.includes(cve)) {
        const comment = [
          `🔄 **Re-opened by Orbit Community Bot (Security Sweep)**`,
          ``,
          `This issue was closed but \`${cve}\` is still listed as an open Dependabot alert.`,
          ``,
          `Please verify the fix was applied correctly and re-close once confirmed.`,
          ``,
          `_Add the \`wontfix\` label to prevent future auto-re-opens._`,
        ].join("\n");

        await reopenIssue(github, context, issue.number, comment);
        console.log(`  🔄 Re-opened #${issue.number} (${cve} still active)`);
        reopened++;
        break;
      }
    }
  }

  console.log(`\n📊 Security sweep complete. Re-opened ${reopened} issue(s).`);
}

// ── Handler: PR labeler (size + path labels) ──────────────────────────────────

async function labelPR(github, context) {
  const pr = context.payload.pull_request;
  if (!pr) return;

  const labelsToAdd = new Set();
  const totalChanges = (pr.additions || 0) + (pr.deletions || 0);

  // Size labels
  if      (totalChanges <= 10)  labelsToAdd.add("size/XS");
  else if (totalChanges <= 50)  labelsToAdd.add("size/S");
  else if (totalChanges <= 200) labelsToAdd.add("size/M");
  else if (totalChanges <= 500) labelsToAdd.add("size/L");
  else                          labelsToAdd.add("size/XL");

  // Path labels
  const filesRes = await github.rest.pulls.listFiles({
    owner:       context.repo.owner,
    repo:        context.repo.repo,
    pull_number: pr.number,
    per_page:    100,
  });

  const paths = filesRes.data.map(f => f.filename);
  const pathRules = [
    { pattern: /^internal\/api\//,          labels: ["backend", "api"]          },
    { pattern: /^internal\/auth\//,         labels: ["backend", "security"]     },
    { pattern: /^internal\/api\/security/,  labels: ["security"]                },
    { pattern: /^web\/src\//,               labels: ["frontend"]                },
    { pattern: /^\.github\//,               labels: ["ci/cd"]                   },
    { pattern: /^Dockerfile$/,              labels: ["docker"]                  },
    { pattern: /^go\.(mod|sum)$/,           labels: ["dependencies"]            },
    { pattern: /^web\/package(-lock)?\.json$/, labels: ["dependencies"]         },
    { pattern: /^docs\//,                   labels: ["documentation"]           },
    { pattern: /\.md$/,                     labels: ["documentation"]           },
  ];

  for (const { pattern, labels } of pathRules) {
    if (paths.some(p => pattern.test(p))) {
      labels.forEach(l => labelsToAdd.add(l));
    }
  }

  // Ensure all labels exist before adding them
  const allLabels = await github.rest.issues.listLabelsForRepo({
    owner:    context.repo.owner,
    repo:     context.repo.repo,
    per_page: 100,
  });
  const existingLabelNames = new Set(allLabels.data.map(l => l.name));

  const labelsArr = [...labelsToAdd].filter(l => existingLabelNames.has(l));

  if (labelsArr.length) {
    await github.rest.issues.addLabels({
      owner:        context.repo.owner,
      repo:         context.repo.repo,
      issue_number: pr.number,
      labels:       labelsArr,
    });
    console.log(`✅ Applied labels: ${labelsArr.join(", ")}`);
  }
}

// ── Handler: Contributor recognition ─────────────────────────────────────────

async function recognizeContributor(github, context) {
  const pr = context.payload.pull_request;
  if (!pr || !pr.merged) return;

  const login = pr.user?.login;
  if (!login || login.includes("[bot]")) return;

  // Count merged PRs by this user
  const searchRes = await github.rest.search.issuesAndPullRequests({
    q: `repo:${context.repo.owner}/${context.repo.repo} is:pr is:merged author:${login}`,
    per_page: 1,
  });
  const totalMerged = searchRes.data.total_count;

  const milestones = [
    { count: 1,  badge: "🌱 First Contribution",  msg: `Welcome to the Orbit community! This is your **first merged contribution** — we're thrilled to have you. 🎉` },
    { count: 5,  badge: "⭐ Regular Contributor",  msg: `You've now had **5 PRs merged** into Orbit. You're becoming a regular contributor — thank you! ⭐` },
    { count: 10, badge: "🚀 Core Contributor",     msg: `**10 merged PRs!** You're officially a core contributor to Orbit. Your dedication makes this project better. 🚀` },
    { count: 25, badge: "💎 Elite Contributor",    msg: `**25 merged PRs!** You're an elite contributor. Orbit would not be what it is without you. 💎` },
  ];

  for (const { count, badge, msg } of milestones) {
    if (totalMerged === count) {
      await github.rest.issues.createComment({
        owner:        context.repo.owner,
        repo:         context.repo.repo,
        issue_number: pr.number,
        body: [
          `### ${badge}`,
          ``,
          `@${login} — ${msg}`,
          ``,
          `_Milestone tracked by [Orbit Community Bot](/.github/assets/community-bot-logo.svg)_`,
        ].join("\n"),
      });
      break;
    }
  }
}

// ── Handler: Create standard labels if missing ────────────────────────────────

async function ensureLabels(github, context) {
  const requiredLabels = [
    { name: "dependabot-alert",     color: "d93f0b", description: "Auto-tracked Dependabot vulnerability alert" },
    { name: "security",             color: "e11d48", description: "Security-related issue or PR"                },
    { name: "auto-tracked",         color: "8250df", description: "Automatically created by community bot"     },
    { name: "ci-failure",           color: "b91c1c", description: "Auto-tracked CI failure"                    },
    { name: "auto-bot",             color: "0075ca", description: "Managed by the community bot"               },
    { name: "priority-high",        color: "ff6b35", description: "High priority item"                         },
    { name: "security-sweep",       color: "7c3aed", description: "Flagged by daily security sweep"            },
    { name: "needs-attention",      color: "f59e0b", description: "Requires attention from maintainers"        },
    { name: "first-contribution",   color: "0e8a16", description: "First contribution from this author"        },
    { name: "size/XS",              color: "3cbf00", description: "Extra small change (≤10 lines)"             },
    { name: "size/S",               color: "5d9801", description: "Small change (≤50 lines)"                   },
    { name: "size/M",               color: "e4a000", description: "Medium change (≤200 lines)"                 },
    { name: "size/L",               color: "ee6600", description: "Large change (≤500 lines)"                  },
    { name: "size/XL",              color: "cc0000", description: "Extra large change (>500 lines)"            },
    { name: "critical",             color: "7b0000", description: "Critical severity vulnerability"            },
    { name: "high",                 color: "b91c1c", description: "High severity vulnerability"                },
    { name: "moderate",             color: "d97706", description: "Moderate severity vulnerability"            },
    { name: "low",                  color: "166534", description: "Low severity vulnerability"                 },
    { name: "backend",              color: "0d1117", description: "Backend / Go code"                          },
    { name: "frontend",             color: "1d4ed8", description: "Frontend / React code"                      },
    { name: "api",                  color: "0891b2", description: "API layer"                                  },
    { name: "docker",               color: "0284c7", description: "Docker / container related"                 },
    { name: "dependencies",         color: "6b7280", description: "Dependency updates"                         },
    { name: "documentation",        color: "4b5563", description: "Documentation changes"                      },
    { name: "ci/cd",                color: "7c3aed", description: "CI/CD and workflow changes"                 },
    { name: "wontfix",              color: "ffffff", description: "This will not be worked on"                 },
  ];

  const existing = await github.rest.issues.listLabelsForRepo({
    owner:    context.repo.owner,
    repo:     context.repo.repo,
    per_page: 100,
  });
  const existingNames = new Set(existing.data.map(l => l.name));

  let created = 0;
  for (const label of requiredLabels) {
    if (!existingNames.has(label.name)) {
      try {
        await github.rest.issues.createLabel({
          owner:       context.repo.owner,
          repo:        context.repo.repo,
          name:        label.name,
          color:       label.color,
          description: label.description,
        });
        console.log(`  ✅ Created label: ${label.name}`);
        created++;
      } catch (err) {
        console.log(`  ⚠️  Could not create label "${label.name}": ${err.message}`);
      }
    }
  }
  console.log(`\n📊 Labels: ${created} created, ${existingNames.size} already existed.`);
}

// ── Router ────────────────────────────────────────────────────────────────────

module.exports = async ({ github, context, core }) => {
  const action = process.env.BOT_ACTION || "unknown";
  console.log(`\n🤖 Orbit Community Bot — action: ${action}\n`);

  const handlers = {
    "sync-dependabot-alerts":  syncDependabotAlerts,
    "close-fixed-alerts":      closeFixedAlertIssues,
    "ci-failure":              createCIFailureIssue,
    "ci-success":              closeCIFailureIssue,
    "security-sweep":          dailySecuritySweep,
    "label-pr":                labelPR,
    "recognize-contributor":   recognizeContributor,
    "ensure-labels":           ensureLabels,
  };

  const handler = handlers[action];
  if (!handler) {
    core.setFailed(`Unknown BOT_ACTION: ${action}`);
    return;
  }

  await handler(github, context);
};
