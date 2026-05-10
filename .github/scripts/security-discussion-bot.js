const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.REPO.split("/");

// ----------------------------
// FETCH ISSUES
// ----------------------------
async function fetchIssues() {
  const res = await octokit.request(
    "GET /repos/{owner}/{repo}/issues",
    {
      owner,
      repo,
      state: "open",
      per_page: 100,
    }
  );

  return res.data.filter(i => !i.pull_request);
}

// ----------------------------
// SIMPLE SIMILARITY ENGINE
// ----------------------------
function similarity(a, b) {
  const A = (a.title + a.body).toLowerCase();
  const B = (b.title + b.body).toLowerCase();

  let score = 0;

  if (A.includes("path") && B.includes("path")) score += 2;
  if (A.includes("exec") && B.includes("exec")) score += 2;
  if (A.includes("ssl") && B.includes("ssl")) score += 2;
  if (A.includes("crypto") && B.includes("crypto")) score += 2;

  const sharedWords = ["codeql", "semgrep", "injection", "traversal"];
  for (const w of sharedWords) {
    if (A.includes(w) && B.includes(w)) score += 1;
  }

  return score;
}

// ----------------------------
// CLUSTER ISSUES
// ----------------------------
function clusterIssues(issues) {
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < issues.length; i++) {
    if (used.has(i)) continue;

    const group = [issues[i]];
    used.add(i);

    for (let j = i + 1; j < issues.length; j++) {
      if (used.has(j)) continue;

      const score = similarity(issues[i], issues[j]);

      if (score >= 3) {
        group.push(issues[j]);
        used.add(j);
      }
    }

    clusters.push(group);
  }

  return clusters;
}

// ----------------------------
// CREATE DISCUSSION
// ----------------------------
async function createDiscussion(title, body) {
  const repoData = await octokit.request(
    "GET /repos/{owner}/{repo}",
    { owner, repo }
  );

  const repoId = repoData.data.node_id;

  const query = `
    mutation($repoId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: {
        repositoryId: $repoId,
        title: $title,
        body: $body,
        categoryId: "DIC_kwDOEXAMPLE" 
      }) {
        discussion {
          id
          url
        }
      }
    }
  `;

  // NOTE: categoryId must be replaced with real one (see below)
}

// ----------------------------
// BUILD DISCUSSION BODY
// ----------------------------
function buildDiscussion(group) {
  return `
## 🔐 Security Pattern Detected

### Summary
This discussion groups similar security issues detected across the codebase.

---

### Issues
${group.map(i => `- #${i.number} ${i.title}`).join("\n")}

---

### Common Pattern
Likely vulnerability type:
- Path traversal
- Command injection
- Crypto misconfiguration

---

### Recommendation
- Fix root cause, not individual instances
- Apply shared patch across modules
- Add regression tests
`;
}

// ----------------------------
// MAIN
// ----------------------------
async function run() {
  const issues = await fetchIssues();
  const clusters = clusterIssues(issues);

  for (const cluster of clusters) {
    if (cluster.length < 2) continue; // only meaningful groups

    const title = `🧠 Security Pattern: ${cluster[0].title}`;
    const body = buildDiscussion(cluster);

    console.log("Cluster found:", cluster.map(i => i.number));

    // For now: log only OR extend to GitHub Discussion creation
  }

  console.log("Done clustering issues.");
}

run().catch(console.error);
