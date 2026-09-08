/**
 * LEGACY COURSE-OUTLINE REDIRECTS - the table, as data.
 *
 * == WHY THIS IS DATA AND NOT 162 LINES IN next.config.mjs ===================
 *
 * Every row here is a URL that was printed on something: emailed to a customer,
 * embedded in a QR code on a flyer, pasted into a chat years ago. They all
 * still RESOLVE - measured, 151 of 151 returning 200 application/pdf - but many
 * serve an OLD revision: old prices, old syllabus. Not-404 is not the same as
 * correct, and a customer scanning a 2024 QR code should get today's outline.
 *
 * The next batch of these is a data edit in this file, not a config edit. That
 * is the point of the split: next.config.mjs calls one function, and reviewing
 * a new batch is reviewing a diff that is entirely source/destination pairs.
 *
 * -- PROVENANCE -------------------------------------------------------------
 * Derived from the authoritative mapping table supplied for round OUT-RDR (159
 * rows), which came from the course team's own spreadsheet. Two deliberate
 * differences from that sheet, both ruled on before this was written:
 *
 *   - 8 rows are HELD, not dropped. Four courses - Microsoft SQL Server
 *     Business Intelligence, Provisioning SQL Server and SQL Azure, AI Content
 *     Creator for Business, UiPath for Business Automation - have no outline
 *     uploaded in either language. Their destinations 404 today, confirmed
 *     twice over: a live GET, and the absence of any course_outline_files row.
 *     Redirecting a readable-but-stale PDF to a 404 is a strict REGRESSION, so
 *     those 8 wait for the files. They ship as a follow-up batch by adding
 *     their rows here.
 *
 *   - The 10 career-path destinations follow outlineFileName()'s convention,
 *     <id>-course-outline-<lang>.pdf, which all 149 existing outlines obey. The
 *     mapping sheet proposed career-<slug>-outline-th.pdf, dropping the
 *     "course-" infix; the "career-" prefix already supplies the
 *     distinguishability that was reaching for, so a second naming rule would
 *     buy nothing and cost the single derivable one.
 *
 * -- TEMPORARY, AND THAT IS NOT A PLACEHOLDER -------------------------------
 * These emit 307, never 308. A wrongly-published permanent redirect is cached
 * in browsers and is effectively unrecallable - the standing rule this repo
 * already applies in its own redirects() header. Flipping them once stable is a
 * one-line change to PERMANENT below.
 *
 * -- SOURCES ARE STORED DECODED; BOTH SPELLINGS ARE EMITTED -----------------
 * See outlineRedirectEntries(). Eleven of these paths contain a literal space
 * and a browser sends it as %20, so matching only one spelling resolves none of
 * them. Read that function's note before touching it - the rule is measured.
 */

/**
 * 307, not 308. See the header: a permanent redirect is not recallable.
 * One line to flip when these are proven stable.
 */
export const PERMANENT = false;

/**
 * The table. `source` is the legacy URL as a human reads it - DECODED, with
 * real spaces. Encoding is applied at the edge of the system, by
 * outlineRedirectEntries(), so this stays reviewable.
 */
export const OUTLINE_REDIRECT_ROWS = Object.freeze([
  // Microsoft Excel Intermediate (th)
  { source: '/sites/default/files/course/outline/excel-intermediate-course-outline_th_0.pdf',
    destination: '/files/course-outline/mse-l1-course-outline-th.pdf' },
  // Microsoft Excel Intermediate (en)
  { source: '/sites/default/files/course/outline/excel-intermediate-course-outline-eng_0.pdf',
    destination: '/files/course-outline/mse-l1-course-outline-en.pdf' },
  // Microsoft Excel Advanced (th)
  { source: '/sites/default/files/course/outline/excel-advanced-course-outline_th_0.pdf',
    destination: '/files/course-outline/mse-l2-course-outline-th.pdf' },
  // Microsoft Excel Advanced (en)
  { source: '/sites/default/files/course/outline/excel-advanced-course-outline-eng_0.pdf',
    destination: '/files/course-outline/mse-l2-course-outline-en.pdf' },
  // Microsoft Excel Macro and VBA (th)
  { source: '/sites/default/files/course/outline/excel-macro-and-vba-course-outline_th_0.pdf',
    destination: '/files/course-outline/mse-l3-course-outline-th.pdf' },
  // Microsoft Excel Macro and VBA (en)
  { source: '/sites/default/files/course/outline/excel-macro-and-vba-course-outline-eng_0.pdf',
    destination: '/files/course-outline/mse-l3-course-outline-en.pdf' },
  // Microsoft Excel Advanced PivotTable and PivotChart (th)
  { source: '/sites/default/files/course/outline/excel-advanced-pivot-table-and-pivot-chart-course-outline_th_0.pdf',
    destination: '/files/course-outline/mse-l4-course-outline-th.pdf' },
  // Microsoft Excel Advanced PivotTable and PivotChart (en)
  { source: '/sites/default/files/course/outline/excel-advanced-pivot-table-and-pivot-chart-course-outline-eng_0.pdf',
    destination: '/files/course-outline/mse-l4-course-outline-en.pdf' },
  // Microsoft Excel Business Intelliegence (th)
  { source: '/sites/default/files/course/outline/excel-business-intelligence-course-outline_th.pdf',
    destination: '/files/course-outline/mse-l5-course-outline-th.pdf' },
  // Microsoft Excel Business Intelliegence (en)
  { source: '/sites/default/files/course/outline/excel-business-intelligence-course-outline-eng.pdf',
    destination: '/files/course-outline/mse-l5-course-outline-en.pdf' },
  // Microsoft Excel Power Query (th)
  { source: '/sites/default/files/course/outline/excel-power-query-course-outline_th.pdf',
    destination: '/files/course-outline/mse-l6-course-outline-th.pdf' },
  // Microsoft Excel Power Query (en)
  { source: '/sites/default/files/course/outline/excel-power-query-course-outline-eng.pdf',
    destination: '/files/course-outline/mse-l6-course-outline-en.pdf' },
  // Microsoft Excel Powerful Functions (th)
  { source: '/sites/default/files/course/outline/excel-powerful-functions-course-outline_th_0.pdf',
    destination: '/files/course-outline/mse-functions-course-outline-th.pdf' },
  // Microsoft Excel Powerful Functions (en)
  { source: '/sites/default/files/course/outline/excel-powerful-functions-course-outline-eng_0.pdf',
    destination: '/files/course-outline/mse-functions-course-outline-en.pdf' },
  // Microsoft Excel Advanced Financial (th)
  { source: '/sites/default/files/course/outline/excel-for-financial-course-outline_th_0.pdf',
    destination: '/files/course-outline/mse-finance-course-outline-th.pdf' },
  // Microsoft Excel Advanced Financial (en)
  { source: '/sites/default/files/course/outline/excel-for-financial-course-outline-eng_0.pdf',
    destination: '/files/course-outline/mse-finance-course-outline-en.pdf' },
  // Microsoft Excel AI for Business (th)
  { source: '/sites/default/files/course/outline/microsoft-excel-ai-course-outline-th.pdf',
    destination: '/files/course-outline/mse-ai-course-outline-th.pdf' },
  // Microsoft Excel AI for Business (en)
  { source: '/sites/default/files/course/outline/microsoft-excel-ai-course-outline-eng.pdf.pdf',
    destination: '/files/course-outline/mse-ai-course-outline-en.pdf' },
  // Microsoft Excel VBA Programming (th)
  { source: '/sites/default/files/course/outline/excel-vba-programming-course-outline_th.pdf',
    destination: '/files/course-outline/mse-l7-course-outline-th.pdf' },
  // Microsoft Excel VBA Programming (en)
  { source: '/sites/default/files/course/outline/excel-vba-programming-course-outline-eng.pdf',
    destination: '/files/course-outline/mse-l7-course-outline-en.pdf' },
  // Microsoft PowerPoint Advanced (th)
  { source: '/sites/default/files/course/outline/powerpoint-advanced-course-outline_th.pdf',
    destination: '/files/course-outline/msp-l1-course-outline-th.pdf' },
  // Microsoft PowerPoint Advanced (en)
  { source: '/sites/default/files/course/outline/powerpoint-advanced-course-outline-eng.pdf',
    destination: '/files/course-outline/msp-l1-course-outline-en.pdf' },
  // Microsoft PowerPoint Design in Actions (th)
  { source: '/sites/default/files/course/outline/powerpoint-design-in-action-course-outline_th.pdf',
    destination: '/files/course-outline/msp-l2-course-outline-th.pdf' },
  // Microsoft PowerPoint Design in Actions (en)
  { source: '/sites/default/files/course/outline/microsoft-powerpoint-design-in-action-eng.pdf',
    destination: '/files/course-outline/msp-l2-course-outline-en.pdf' },
  // Infographics & Digital Media with Advanced Microsoft PowerPoint (th)
  { source: '/sites/default/files/course/outline/infographics-digital-media-advanced-microsoft-powerpoint-course-outline_th.pdf',
    destination: '/files/course-outline/msp-l3-course-outline-th.pdf' },
  // Infographics & Digital Media with Advanced Microsoft PowerPoint (en)
  { source: '/sites/default/files/course/outline/infographics-digital-media-advanced-microsoft-powerpoint-course-outline-eng.pdf',
    destination: '/files/course-outline/msp-l3-course-outline-en.pdf' },
  // Microsoft Access Intermediate (th)
  { source: '/sites/default/files/course/outline/access-intermediate-course-outline_th.pdf',
    destination: '/files/course-outline/msa-l1-course-outline-th.pdf' },
  // Microsoft Access Intermediate (en)
  { source: '/sites/default/files/course/outline/access-intermediate-course-outline-eng_1.pdf',
    destination: '/files/course-outline/msa-l1-course-outline-en.pdf' },
  // Microsoft Access Advanced and Macro (th)
  { source: '/sites/default/files/course/outline/access-advanced-and-macro-course-outline_th.pdf',
    destination: '/files/course-outline/msa-l2-course-outline-th.pdf' },
  // Microsoft Access Advanced and Macro (en)
  { source: '/sites/default/files/course/outline/access-advanced-and-macro-course-outline-eng.pdf',
    destination: '/files/course-outline/msa-l2-course-outline-en.pdf' },
  // Microsoft Access VBA (th)
  { source: '/sites/default/files/course/outline/access-vba-course-outline_th.pdf',
    destination: '/files/course-outline/msa-l3-course-outline-th.pdf' },
  // Microsoft Access VBA (en)
  { source: '/sites/default/files/course/outline/access-vba-course-outline-eng.pdf',
    destination: '/files/course-outline/msa-l3-course-outline-en.pdf' },
  // Power BI Desktop for Business Analytics (th)
  { source: '/sites/default/files/course/outline/power-bi-desktop-business-analytics-courses-outline-th_0.pdf',
    destination: '/files/course-outline/power-bi-course-outline-th.pdf' },
  // Power BI Desktop for Business Analytics (en)
  { source: '/sites/default/files/course/outline/power-bi-desktop-business-analytics-courses-outline-eng_0.pdf',
    destination: '/files/course-outline/power-bi-course-outline-en.pdf' },
  // Power BI Advanced Power Query (th)
  { source: '/sites/default/files/course/outline/power-bi-advanced-power-query-course-outline-th_0.pdf',
    destination: '/files/course-outline/power-bi-pq-course-outline-th.pdf' },
  // Power BI Advanced Power Query (en)
  { source: '/sites/default/files/course/outline/power-bi-advanced-power-query-course-outline-eng_0.pdf',
    destination: '/files/course-outline/power-bi-pq-course-outline-en.pdf' },
  // Data Analysis Expressions (DAX) for Power BI (th)
  { source: '/sites/default/files/course/outline/power-bi-data-analysis-expression-dax-course-outline-th_0.pdf',
    destination: '/files/course-outline/power-bi-dax-course-outline-th.pdf' },
  // Data Analysis Expressions (DAX) for Power BI (en)
  { source: '/sites/default/files/course/outline/power-bi-data-analysis-expression-dax-course-outline-eng_0.pdf',
    destination: '/files/course-outline/power-bi-dax-course-outline-en.pdf' },
  // Power BI Advanced Visualization and AI (th)
  { source: '/sites/default/files/course/outline/power-bi-desktop-advanced-visualization-and-artificial-intelligence-course-outline-th_0.pdf',
    destination: '/files/course-outline/power-bi-adv-course-outline-th.pdf' },
  // Power BI Advanced Visualization and AI (en)
  { source: '/sites/default/files/course/outline/power-bi-desktop-advanced-visualization-and-artificial-intelligence-course-outline-eng_0.pdf',
    destination: '/files/course-outline/power-bi-adv-course-outline-en.pdf' },
  // Data Model for Power BI (th)
  { source: '/sites/default/files/course/outline/data-model-for-power-bi-course-outline-th_0.pdf',
    destination: '/files/course-outline/power-bi-xdm-course-outline-th.pdf' },
  // Data Model for Power BI (en)
  { source: '/sites/default/files/course/outline/data-model-for-power-bi-course-outline-eng_0.pdf',
    destination: '/files/course-outline/power-bi-xdm-course-outline-en.pdf' },
  // Power Apps for Business (th)
  { source: '/sites/default/files/course/outline/power-apps-course-outline-th.pdf',
    destination: '/files/course-outline/power-apps-course-outline-th.pdf' },
  // Power Apps for Business (en)
  { source: '/sites/default/files/course/outline/power-apps-for-business-courses-outline-eng.pdf',
    destination: '/files/course-outline/power-apps-course-outline-en.pdf' },
  // Advanced Power Apps for Business (th)
  { source: '/sites/default/files/course/outline/advanced-power-apps-course-outline-th.pdf',
    destination: '/files/course-outline/power-apps-adv-course-outline-th.pdf' },
  // Advanced Power Apps for Business (en)
  { source: '/sites/default/files/course/outline/advanced-power-apps-for-business-course-outline-eng.pdf',
    destination: '/files/course-outline/power-apps-adv-course-outline-en.pdf' },
  // Power Automate (Cloud) for Business Automation (th)
  { source: '/sites/default/files/course/outline/power-automate-for-business-automation-cloud-course-outline-th.pdf',
    destination: '/files/course-outline/pam-cld-course-outline-th.pdf' },
  // Power Automate (Cloud) for Business Automation (en)
  { source: '/sites/default/files/course/outline/power-automate-for-business-automation-course-outline-eng_0.pdf',
    destination: '/files/course-outline/pam-cld-course-outline-en.pdf' },
  // Power Automate (Desktop) for Business Automation (th)
  { source: '/sites/default/files/course/outline/power-automate-desktop-course-outline-th.pdf',
    destination: '/files/course-outline/pam-dsk-course-outline-th.pdf' },
  // Power Automate (Desktop) for Business Automation (en)
  { source: '/sites/default/files/course/outline/power-automate-desktop-course-outline-eng.pdf',
    destination: '/files/course-outline/pam-dsk-course-outline-en.pdf' },
  // Advanced Power Automate (Cloud) (th)
  { source: '/sites/default/files/course/outline/advanced-power-automate-cloud-course-outline-th.pdf',
    destination: '/files/course-outline/pam-cld-adv-course-outline-th.pdf' },
  // Advanced Power Automate (Cloud) (en)
  { source: '/sites/default/files/course/outline/advanced-power-automate-cloud-course-outline-eng.pdf',
    destination: '/files/course-outline/pam-cld-adv-course-outline-en.pdf' },
  // Advanced Power Automate (Desktop) (th)
  { source: '/sites/default/files/course/outline/advanced-power-automate-desktop-course-outline-th.pdf',
    destination: '/files/course-outline/pam-dsk-adv-course-outline-th.pdf' },
  // Advanced Power Automate (Desktop) (en)
  { source: '/sites/default/files/course/outline/advanced-power-automate-desktop-course-outline-eng.pdf',
    destination: '/files/course-outline/pam-dsk-adv-course-outline-en.pdf' },
  // AI Builder in Power Platform for Business (th)
  { source: '/sites/default/files/course/outline/ai-builder-for-business-course-outline-th.pdf',
    destination: '/files/course-outline/pp-ai-course-outline-th.pdf' },
  // AI Builder in Power Platform for Business (en)
  { source: '/sites/default/files/course/outline/ai-builder-for-business-course-outline-eng.pdf',
    destination: '/files/course-outline/pp-ai-course-outline-en.pdf' },
  // Build Power Apps with Power Automate (th)
  { source: '/sites/default/files/course/outline/build-power-apps-with-power-automate-course-outline-th.pdf',
    destination: '/files/course-outline/power-pf-b1-course-outline-th.pdf' },
  // Innovation Anywhere with Microsoft Power Platform (th)
  { source: '/sites/default/files/course/outline/power-platform-courses-outline-th.pdf',
    destination: '/files/course-outline/power-pf-course-outline-th.pdf' },
  // Innovation Anywhere with Microsoft Power Platform (en)
  { source: '/sites/default/files/course/outline/innovation-anywhere-with-microsoft-power-platform-course-outline-eng.pdf',
    destination: '/files/course-outline/power-pf-course-outline-en.pdf' },
  // AI Agents with Microsoft Copilot Studio (th)
  { source: '/sites/default/files/course/outline/ai-agents-with-microsoft-copilot-studio-course-outline-th.pdf',
    destination: '/files/course-outline/copilot-stu-course-outline-th.pdf' },
  // Canva Pro for Smart Working (th)
  { source: '/sites/default/files/course/outline/canva-pro-2024-smart-working-course-outline-th.pdf',
    destination: '/files/course-outline/canva-l1-course-outline-th.pdf' },
  // Canva Pro for Smart Working (en)
  { source: '/sites/default/files/course/outline/canva-pro-for-smart-working-course-outline-eng.pdf',
    destination: '/files/course-outline/canva-l1-course-outline-en.pdf' },
  // Canva AI for Business Accelerator (th)
  { source: '/sites/default/files/course/outline/canva-ai-for-business-accelerator-course-outline-th.pdf',
    destination: '/files/course-outline/canva-l2-course-outline-th.pdf' },
  // Canva AI for Business Accelerator (en)
  { source: '/sites/default/files/course/outline/canva-ai-for-business-accelerator-course-outline-eng.pdf',
    destination: '/files/course-outline/canva-l2-course-outline-en.pdf' },
  // Microsoft SQL Server Essential (th)
  { source: '/sites/default/files/course/outline/sql-server-essential-course-outline_th.pdf',
    destination: '/files/course-outline/sql-101-course-outline-th.pdf' },
  // Microsoft SQL Server Essential (en)
  { source: '/sites/default/files/course/outline/sql-server-essential-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-101-course-outline-en.pdf' },
  // Querying Data with T-SQL (th)
  { source: '/sites/default/files/course/outline/query-data-with-tsql-course-outline_th.pdf',
    destination: '/files/course-outline/sql-pg-query-course-outline-th.pdf' },
  // Querying Data with T-SQL (en)
  { source: '/sites/default/files/course/outline/query-data-with-tsql-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-pg-query-course-outline-en.pdf' },
  // SQL Server Programming - Store Procedure (th)
  { source: '/sites/default/files/course/outline/sql-server-programming-stored-procedure-course-outline_th.pdf',
    destination: '/files/course-outline/sql-pg-sp-course-outline-th.pdf' },
  // SQL Server Programming - Store Procedure (en)
  { source: '/sites/default/files/course/outline/sql-server-programming-stored-procedure-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-pg-sp-course-outline-en.pdf' },
  // Microsoft SQL Server Database Administration (th)
  { source: '/sites/default/files/course/outline/sql-server-administrator-course-outline_th.pdf',
    destination: '/files/course-outline/sql-adm-course-outline-th.pdf' },
  // Microsoft SQL Server Database Administration (en)
  { source: '/sites/default/files/course/outline/sql-server-administrator-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-adm-course-outline-en.pdf' },
  // Microsoft SQL Server Performance Tuning (th)
  { source: '/sites/default/files/course/outline/sql-server-performance-tuning-course-outline_th.pdf',
    destination: '/files/course-outline/sql-adm-tuning-course-outline-th.pdf' },
  // Microsoft SQL Server Performance Tuning (en)
  { source: '/sites/default/files/course/outline/sql-server-performance-tuning-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-adm-tuning-course-outline-en.pdf' },
  // ETL with SQL Server Integration Service (SSIS) (th)
  { source: '/sites/default/files/course/outline/etl-with-sql-server-integration-service-course-outline_th.pdf',
    destination: '/files/course-outline/sql-bi-etl-course-outline-th.pdf' },
  // ETL with SQL Server Integration Service (SSIS) (en)
  { source: '/sites/default/files/course/outline/etl-with-sql-server-integration-service-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-bi-etl-course-outline-en.pdf' },
  // Database Concept and Design (th)
  { source: '/sites/default/files/course/outline/database-concept-and-design-course-outline_th.pdf',
    destination: '/files/course-outline/db-01-course-outline-th.pdf' },
  // Database Concept and Design (en)
  { source: '/sites/default/files/course/outline/database-concept-and-design-course-outline-eng.pdf',
    destination: '/files/course-outline/db-01-course-outline-en.pdf' },
  // Microsoft SQL Server Database Development (th)
  { source: '/sites/default/files/course/outline/sql-server-database-development-course-outline_th.pdf',
    destination: '/files/course-outline/ms-sql-19-dev-course-outline-th.pdf' },
  // Microsoft SQL Server Database Development (en)
  { source: '/sites/default/files/course/outline/sql-server-database-development-course-outline-eng.pdf',
    destination: '/files/course-outline/ms-sql-19-dev-course-outline-en.pdf' },
  // Professional SQL Server Database Backup (th)
  { source: '/sites/default/files/course/outline/sql-server-database-backup-course-outline_th.pdf',
    destination: '/files/course-outline/sql-adm-bk-course-outline-th.pdf' },
  // Professional SQL Server Database Backup (en)
  { source: '/sites/default/files/course/outline/sql-server-database-backup-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-adm-bk-course-outline-en.pdf' },
  // SQL Server Security Management (th)
  { source: '/sites/default/files/course/outline/sql-server-security-management-course-outline_th.pdf',
    destination: '/files/course-outline/sql-adm-secure-course-outline-th.pdf' },
  // SQL Server Security Management (en)
  { source: '/sites/default/files/course/outline/sql-server-security-management-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-adm-secure-course-outline-en.pdf' },
  // Multi-Dimension Data Model with SQL Server Analysis (th)
  { source: '/sites/default/files/course/outline/multi-dimension-data-model-with-sql-server-analysis-service-course-outline_th.pdf',
    destination: '/files/course-outline/sql-bi-mdm-course-outline-th.pdf' },
  // Multi-Dimension Data Model with SQL Server Analysis (en)
  { source: '/sites/default/files/course/outline/multi-dimension-data-model-with-sql-server-analysis-service-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-bi-mdm-course-outline-en.pdf' },
  // Tabular Data Model with SQL Server Analysis Service (th)
  { source: '/sites/default/files/course/outline/tabular-data-model-with-sql-server-analysis-service-course-outline_th.pdf',
    destination: '/files/course-outline/sql-bi-tdm-course-outline-th.pdf' },
  // Tabular Data Model with SQL Server Analysis Service (en)
  { source: '/sites/default/files/course/outline/tabular-data-model-with-sql-server-analysis-service-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-bi-tdm-course-outline-en.pdf' },
  // SQL Server Table Structure and Index (th)
  { source: '/sites/default/files/course/outline/sql-server-table-structure-and-index-course-outline_th.pdf',
    destination: '/files/course-outline/sql-pg-tbix-course-outline-th.pdf' },
  // SQL Server Table Structure and Index (en)
  { source: '/sites/default/files/course/outline/sql-server-table-structure-and-index-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-pg-tbix-course-outline-en.pdf' },
  // SQL Server Agent and PowerShell for Automation (th)
  { source: '/sites/default/files/course/outline/sql-server-agent-course-outline_th.pdf',
    destination: '/files/course-outline/sql-adm-agt-course-outline-th.pdf' },
  // SQL Server Agent and PowerShell for Automation (en)
  { source: '/sites/default/files/course/outline/sql-server-agent-course-outline-eng.pdf',
    destination: '/files/course-outline/sql-adm-agt-course-outline-en.pdf' },
  // Microsoft 365 Copilot for Business Professionals (th)
  { source: '/sites/default/files/course/outline/copilot-for-business-professionals-course-outline-th.pdf',
    destination: '/files/course-outline/copilot-m365-course-outline-th.pdf' },
  // Microsoft 365 Copilot for Business Professionals (en)
  { source: '/sites/default/files/course/outline/copilot-for-business-professionals-course-outline-eng.pdf',
    destination: '/files/course-outline/copilot-m365-course-outline-en.pdf' },
  // Generative AI for Business Transformation (th)
  { source: '/sites/default/files/course/outline/generative-ai-for-business-course-outline-th.pdf',
    destination: '/files/course-outline/gen-ai-l1-course-outline-th.pdf' },
  // Generative AI for Business Transformation (en)
  { source: '/sites/default/files/course/outline/generative-ai-for business-transformation-course-outline-eng.pdf',
    destination: '/files/course-outline/gen-ai-l1-course-outline-en.pdf' },
  // AI Automation Agent with Make.com (th)
  { source: '/sites/default/files/course/outline/ai-automation-agent-with-make-course-outline-th.pdf',
    destination: '/files/course-outline/make-l1-course-outline-th.pdf' },
  // AI Automation Agent with Make.com (en)
  { source: '/sites/default/files/course/outline/ai-automation-agent-with-make-course-outline-eng.pdf',
    destination: '/files/course-outline/make-l1-course-outline-en.pdf' },
  // Workflow Automation with n8n (th)
  { source: '/sites/default/files/course/outline/workflow-automation-with-n8n-course-outline-th.pdf',
    destination: '/files/course-outline/n8n-l1-course-outline-th.pdf' },
  // Workflow Automation with n8n (en)
  { source: '/sites/default/files/course/outline/workflow-automation-with-n8n-course-outline-eng.pdf',
    destination: '/files/course-outline/n8n-l1-course-outline-en.pdf' },
  // Claude Cowork for Business (th)
  { source: '/sites/default/files/course/outline/claude-cowork-course-outline-th.pdf',
    destination: '/files/course-outline/claude-ai-course-outline-th.pdf' },
  // Claude Cowork for Business (en)
  { source: '/sites/default/files/course/outline/claude-cowork-course-outline-eng.pdf.pdf',
    destination: '/files/course-outline/claude-ai-course-outline-en.pdf' },
  // Build Business Apps with Claude Code (th)
  { source: '/sites/default/files/course/outline/build-business-app-with-claude-code.pdf',
    destination: '/files/course-outline/vibe-code-l1-course-outline-th.pdf' },
  // Build Business Apps with Claude Code (en)
  { source: '/sites/default/files/course/outline/build-business-app-with-claude-code.pdf.pdf',
    destination: '/files/course-outline/vibe-code-l1-course-outline-en.pdf' },
  // Build AI Multi-Agent with Claude Code (th)
  { source: '/sites/default/files/course/outline/build-multi-agent-with-claude-code-course-outline-th.pdf',
    destination: '/files/course-outline/vibe-code-l2-course-outline-th.pdf' },
  // Manus AI for Marketing Mastery (th)
  { source: '/sites/default/files/course/outline/manus-ai-for-marketing-mastery-course-outline-th.pdf',
    destination: '/files/course-outline/manus-mkt-course-outline-th.pdf' },
  // Manus AI for Marketing Mastery (en)
  { source: '/sites/default/files/course/outline/manus-ai-for-marketing-mastery-course-outline-eng.pdf_0.pdf',
    destination: '/files/course-outline/manus-mkt-course-outline-en.pdf' },
  // Manus AI for Exclusive Owner Business (th)
  { source: '/sites/default/files/course/outline/manus-ai-for-exclusive-owner-business-course-outline-th.pdf',
    destination: '/files/course-outline/manus-exc-course-outline-th.pdf' },
  // Manus AI for Exclusive Owner Business (en)
  { source: '/sites/default/files/course/outline/manus-ai-for-exclusive-owner-business-course-outline-eng.pdf',
    destination: '/files/course-outline/manus-exc-course-outline-en.pdf' },
  // Programming in C# with Visual Studio (th)
  { source: '/sites/default/files/course/outline/programming-c-sharp-course-outline-th.pdf',
    destination: '/files/course-outline/dev-vs-01-course-outline-th.pdf' },
  // Programming in C# with Visual Studio (en)
  { source: '/sites/default/files/course/outline/programming-in-c-sharp-with-visual-studio-course-outline-eng.pdf',
    destination: '/files/course-outline/dev-vs-01-course-outline-en.pdf' },
  // ASP.NET Core MVC (th)
  { source: '/sites/default/files/course/outline/asp-core-mvc-course-outline-th.pdf',
    destination: '/files/course-outline/dev-vs-04-course-outline-th.pdf' },
  // ASP.NET Core MVC (en)
  { source: '/sites/default/files/course/outline/asp-net-core-mvc-course-outline-eng.pdf',
    destination: '/files/course-outline/dev-vs-04-course-outline-en.pdf' },
  // ASP.NET Core Web API & Security (th)
  { source: '/sites/default/files/course/outline/asp-core-web-api-course-outline-th.pdf',
    destination: '/files/course-outline/dev-vs-06-course-outline-th.pdf' },
  // ASP.NET Core Web API & Security (en)
  { source: '/sites/default/files/course/outline/asp-core-web-api-course-outline-eng.pdf',
    destination: '/files/course-outline/dev-vs-06-course-outline-en.pdf' },
  // .NET MAUI : การพัฒนา Native Cross-platform Apps ด้วย C# (th)
  { source: '/sites/default/files/course/outline/net-maui-course-outline-th.pdf',
    destination: '/files/course-outline/dev-vs-05-course-outline-th.pdf' },
  // .NET MAUI : การพัฒนา Native Cross-platform Apps ด้วย C# (en)
  { source: '/sites/default/files/course/outline/net-maui-course-outline-eng.pdf',
    destination: '/files/course-outline/dev-vs-05-course-outline-en.pdf' },
  // ASP.NET MVC 5 with Visual Studio (th)
  { source: '/sites/default/files/course/outline/asp-core-mvc-5-course-outline-th.pdf',
    destination: '/files/course-outline/dev-vs-03-course-outline-th.pdf' },
  // ASP.NET MVC 5 with Visual Studio (en)
  { source: '/sites/default/files/course/outline/asp-net-mvc-5-course-outline-eng.pdf',
    destination: '/files/course-outline/dev-vs-03-course-outline-en.pdf' },
  // ASP.NET Web Development with Visual Studio (th)
  { source: '/sites/default/files/course/outline/asp-web-development-course-outline-th.pdf',
    destination: '/files/course-outline/dev-vs-02-course-outline-th.pdf' },
  // ASP.NET Web Development with Visual Studio (en)
  { source: '/sites/default/files/course/outline/web-development-with-visual-studio-course-outline-eng.pdf',
    destination: '/files/course-outline/dev-vs-02-course-outline-en.pdf' },
  // Responsive Web Design with Bootstrap (th)
  { source: '/sites/default/files/course/outline/responsive-web-design-course-outline-th.pdf',
    destination: '/files/course-outline/dev-bt-course-outline-th.pdf' },
  // Responsive Web Design with Bootstrap (en)
  { source: '/sites/default/files/course/outline/responsive-web-design-with-bootstrap-course-outline-eng.pdf',
    destination: '/files/course-outline/dev-bt-course-outline-en.pdf' },
  // Python Programming (th)
  { source: '/sites/default/files/course/outline/python-programming-course-outline-th.pdf',
    destination: '/files/course-outline/python-l1-course-outline-th.pdf' },
  // Python Programming (en)
  { source: '/sites/default/files/course/outline/python-programming-course-outline-eng.pdf',
    destination: '/files/course-outline/python-l1-course-outline-en.pdf' },
  // Machine Learning using Python (th)
  { source: '/sites/default/files/course/outline/machine-learning-using-python-course-outline-th.pdf',
    destination: '/files/course-outline/python-l2-course-outline-th.pdf' },
  // Machine Learning using Python (en)
  { source: '/sites/default/files/course/outline/machine-learning-using-python-course-outline-eng.pdf',
    destination: '/files/course-outline/python-l2-course-outline-en.pdf' },
  // Agentic AI Development With Google ADK and Python (th)
  { source: '/sites/default/files/course/outline/agentic-ai-with-google-adk-course-outline-th.pdf',
    destination: '/files/course-outline/goo-adk-course-outline-th.pdf' },
  // Agentic AI Development With Google ADK and Python (en)
  { source: '/sites/default/files/course/outline/agentic-ai-development-with-google-adk-and-python-course-outline-eng.pdf',
    destination: '/files/course-outline/goo-adk-course-outline-en.pdf' },
  // Microsoft Fabric Essential for Business (th)
  { source: '/sites/default/files/course/outline/microsoft-fabric-essential-for-business-course-outline-th.pdf',
    destination: '/files/course-outline/ms-fb-101-course-outline-th.pdf' },
  // Microsoft Fabric Essential for Business (en)
  { source: '/sites/default/files/course/outline/microsoft-fabric-essential-for-business-course-outline-eng.pdf',
    destination: '/files/course-outline/ms-fb-101-course-outline-en.pdf' },
  // GitHub Copilot for Developer (th)
  { source: '/sites/default/files/course/outline/github-copilot-course-outline-th.pdf',
    destination: '/files/course-outline/copilot-dev-course-outline-th.pdf' },
  // GitHub Copilot for Developer (en)
  { source: '/sites/default/files/course/outline/github-copilot-course-outline-eng.pdf',
    destination: '/files/course-outline/copilot-dev-course-outline-en.pdf' },
  // Microsoft Word Professional (th)
  { source: '/sites/default/files/course/outline/microsoft-word-course-outline-th.pdf',
    destination: '/files/course-outline/mswo365-pro-course-outline-th.pdf' },
  // Microsoft Word Professional (en)
  { source: '/sites/default/files/course/outline/word-professional-training-course-outline-eng.pdf',
    destination: '/files/course-outline/mswo365-pro-course-outline-en.pdf' },
  // Microsoft 365 for Business (th)
  { source: '/sites/default/files/course/outline/365-for-business-course-outline-th.pdf',
    destination: '/files/course-outline/ms365-l1-course-outline-th.pdf' },
  // Microsoft 365 for Business (en)
  { source: '/sites/default/files/course/outline/microsoft-365-for-business-course-outline-eng.pdf',
    destination: '/files/course-outline/ms365-l1-course-outline-en.pdf' },
  // Microsoft Project Managing Projects (th)
  { source: '/sites/default/files/course/outline/microsoft-project-course-outline-th_0.pdf',
    destination: '/files/course-outline/msj-l1-course-outline-th.pdf' },
  // Microsoft Project Managing Projects (en)
  { source: '/sites/default/files/course/outline/microsoft-project-managing-projects-course-outline-eng.pdf',
    destination: '/files/course-outline/msj-l1-course-outline-en.pdf' },
  // Multi-Agent with Microsoft Copilot Studio (th)
  { source: '/sites/default/files/course/outline/multi-agent-with-microsoft-copilot-studio-course-outline-th.pdf',
    destination: '/files/course-outline/copilot-stu-adv-course-outline-th.pdf' },
  // Microsoft 365 Copilot Cowork for Productivity (th)
  { source: '/sites/default/files/course/outline/microsoft-365-copilot-cowork.pdf',
    destination: '/files/course-outline/copilot-cowork-course-outline-th.pdf' },
  // Prompt Engineer (th)
  { source: '/images/career-path/course-outline/Career Path - Prompt Engineer-2.pdf',
    destination: '/files/course-outline/career-prompt-engineer-course-outline-th.pdf' },
  // Business Analytics (th)
  { source: '/images/career-path/course-outline/Career Path - Business Analytics.pdf',
    destination: '/files/course-outline/career-business-analytics-course-outline-th.pdf' },
  // Citizen Developer (th)
  { source: '/images/career-path/course-outline/Career Path - Citizen Developer.pdf',
    destination: '/files/course-outline/career-citizen-developer-course-outline-th.pdf' },
  // RPA Developer (th)
  { source: '/images/career-path/course-outline/Career Path - RPA Developer fix 09-March-26.pdf',
    destination: '/files/course-outline/career-rpa-developer-course-outline-th.pdf' },
  // Accounting & Finance (th)
  { source: '/images/career-path/course-outline/Career Path - Accounting _ Finance.pdf',
    destination: '/files/course-outline/career-accounting-and-finance-course-outline-th.pdf' },
  // Data Analyst (th)
  { source: '/images/career-path/course-outline/Career Path - Data Analyst.pdf',
    destination: '/files/course-outline/career-data-analyst-course-outline-th.pdf' },
  // Data Engineering & Business Intelligence (th)
  { source: '/images/career-path/course-outline/Career Path - Data Engineering_Business Intelligence.pdf',
    destination: '/files/course-outline/career-data-engineering-and-business-intelligence-course-outline-th.pdf' },
  // Power Automate Specialist (th)
  { source: '/images/career-path/course-outline/Career Path - Power Automate Specialist.pdf',
    destination: '/files/course-outline/career-power-automate-specialist-course-outline-th.pdf' },
  // Web Developer (th)
  { source: '/images/career-path/course-outline/Career Path - Web Developer.pdf',
    destination: '/files/course-outline/career-web-developer-course-outline-th.pdf' },
  // Visual Communication & Presentation (th)
  { source: '/images/career-path/course-outline/Career Path - Visual Communication 19-nov-25.pdf',
    destination: '/files/course-outline/career-visual-communication-and-presentation-course-outline-th.pdf' },
]);

/**
 * Characters that are NOT safe unencoded in a path segment.
 *
 * MEASURED across all 151 sources: the space is the ONLY character here whose
 * encoded form differs from its literal one. No Thai, no `&`, no `#`, no
 * parentheses - so this needs no general encoder, and deliberately is not one.
 */
const ENCODABLE = /[^A-Za-z0-9\-._~/]/g;

/**
 * Assert the table still contains nothing but the character we reviewed.
 *
 * Loud on purpose, and modelled on assertNoUnreviewedInvalidChars in
 * legacyPublicId.js: a generic "just encode everything" helper would quietly
 * invent a mapping nobody reviewed at the exact moment nobody is watching. If a
 * future batch introduces a character needing encoding, this THROWS and a human
 * decides what the encoded spelling should be.
 */
export function assertOnlyReviewedEncodables(rows = OUTLINE_REDIRECT_ROWS) {
  for (const { source } of rows) {
    const offenders = [...new Set((source.match(ENCODABLE) ?? []).filter((c) => c !== ' '))];
    if (offenders.length) {
      throw new Error(
        `legacyOutlineRedirects: ${source} contains ${JSON.stringify(offenders)}, which needs `
        + 'a percent-encoded spelling nobody has reviewed. Decide the mapping, then widen this check.'
      );
    }
  }
  return true;
}

/** The percent-encoded spelling of a source. Spaces only - see ENCODABLE. */
export function encodeSource(source) {
  return source.replace(/ /g, '%20');
}

/**
 * The table as Next redirect entries.
 *
 * == BOTH SPELLINGS, AND WHY THAT IS NOT BELT-AND-BRACES =====================
 *
 * Next matches `source` against the RAW request pathname, and the matcher is
 * LITERAL: a source written with a space matches only a literal-space path, and
 * a source written with %20 matches only a %20 path. Verified directly against
 * Next's own vendored path-to-regexp - the two forms are mutually exclusive and
 * neither matches the other.
 *
 * A browser, and therefore a QR scanner, percent-encodes a space. So the
 * encoded spelling is the one that actually arrives, and declaring only the
 * decoded form would resolve 0 of the 11 paths that contain one.
 *
 * This is the same finding the `&`/`#` rules in next.config.mjs already record,
 * measured there rather than assumed: "matching only `&` let every encoded
 * request fall through and return HTTP 400 - 0 of 6 resolved". The decoded
 * spelling is kept alongside it so a server-side caller passing an unencoded
 * path still matches, which is the shape those rules settled on.
 */
export function outlineRedirectEntries(rows = OUTLINE_REDIRECT_ROWS) {
  assertOnlyReviewedEncodables(rows);
  return rows.flatMap(({ source, destination }) => {
    const entries = [{ source, destination, permanent: PERMANENT }];
    const encoded = encodeSource(source);
    if (encoded !== source) entries.push({ source: encoded, destination, permanent: PERMANENT });
    return entries;
  });
}
