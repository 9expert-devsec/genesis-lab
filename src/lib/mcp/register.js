/**
 * Wires the five pure tools to the real read paths and registers them on an
 * MCP server instance.
 *
 * ── THE SPLIT IS THE POINT ─────────────────────────────────────────────────
 * Every tool in lib/mcp/tools is a pure function over injected fetchers, and
 * this is the ONLY file that knows what the real ones are. That is what lets
 * the test suite exercise the trap logic — stale statuses, orphan rounds,
 * case-insensitive ids, taxonomy refusals — without a database, a socket, or a
 * key, in a runner that shares one process across 799 files.
 *
 * ── SAME READS AS THE PUBLIC SITE, DELIBERATELY ────────────────────────────
 * `listPublicCourses`, `listOnlineCourses`, `listSchedules`, `listPrograms`
 * and `listSkills` all go through `aiFetch`, which sets `next: { revalidate,
 * tags }`. The Data Cache key is url+options, so an MCP call usually lands on
 * the cache entry the catalogue page already populated and costs no upstream
 * request at all. This file adds no tag, changes no `revalidate`, and holds no
 * cache of its own — a second caching layer here is how the server and the site
 * would start disagreeing about what a course costs.
 *
 * READ-ONLY BY CONSTRUCTION: every import below is a list or a getter. There is
 * no write path to reach from here even by mistake.
 */

import { z } from 'zod';

import { getOnlineCourses } from '@/lib/api/online-courses';
import { listPrograms } from '@/lib/api/programs';
import { getCourseByCodeInsensitive, listPublicCourses } from '@/lib/api/public-courses';
import { listSchedules } from '@/lib/api/schedules';
import { listSkills } from '@/lib/api/skills';
import { buildPromotionsCorpus } from '@/lib/corpus/promotions';
import { getNavMenuData } from '@/lib/navmenu/getNavMenuData';

import { McpToolError } from '@/lib/mcp/shape';
import {
  LIST_PROGRAMS_AND_SKILLS_DESCRIPTION,
  listProgramsAndSkills,
} from '@/lib/mcp/tools/listProgramsAndSkills';
import {
  SEARCH_COURSES_DESCRIPTION,
  SEARCH_COURSES_LIMIT_DEFAULT,
  SEARCH_COURSES_LIMIT_MAX,
  searchCourses,
} from '@/lib/mcp/tools/searchCourses';
import { GET_COURSE_DETAIL_DESCRIPTION, getCourseDetail } from '@/lib/mcp/tools/getCourseDetail';
import {
  LIST_TRAINING_ROUNDS_DESCRIPTION,
  LIST_TRAINING_ROUNDS_LIMIT_DEFAULT,
  LIST_TRAINING_ROUNDS_LIMIT_MAX,
  listTrainingRounds,
} from '@/lib/mcp/tools/listTrainingRounds';
import {
  LIST_LIVE_PROMOTIONS_DESCRIPTION,
  listLivePromotions,
} from '@/lib/mcp/tools/listLivePromotions';

export const MCP_SERVER_NAME = '9expert';
export const MCP_SERVER_VERSION = '0.1.0';

/** The real read paths, in one object so a test can substitute the lot. */
export const productionDeps = {
  listPrograms,
  listSkills,
  getNavMenuData,
  listPublicCourses,
  // The dep is named for what a tool asks of it; the module's own export is
  // `getOnlineCourses`. Aliased here rather than renamed at nine call sites.
  listOnlineCourses: getOnlineCourses,
  getCourseByCodeInsensitive,
  listSchedules,
  buildPromotionsCorpus,
};

/**
 * Run a tool and shape its answer for MCP.
 *
 * An `McpToolError` becomes an `isError` result with its text intact, because
 * every one of them is written FOR the model to read — "unknown skill, here are
 * the valid ones" is only useful if it arrives as words rather than as a 500.
 * Anything else is logged server-side and returned as a flat failure: an
 * upstream stack trace is not something to hand a language model.
 */
async function runTool(name, fn, args, deps) {
  try {
    const result = await fn(args, deps);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    if (err instanceof McpToolError) {
      return { content: [{ type: 'text', text: err.message }], isError: true };
    }
    console.error(`[mcp] tool "${name}" failed:`, err);
    return {
      content: [{ type: 'text', text: `The ${name} tool could not complete. This is a server-side fault, not a bad request.` }],
      isError: true,
    };
  }
}

/**
 * Register all five tools on an MCP server.
 *
 * @param {object} server the McpServer handed over by mcp-handler
 * @param {object} [deps] injectable read paths; production passes nothing
 */
export function registerMcpTools(server, deps = productionDeps) {
  /**
   * NO SCHEMA ARGUMENT, deliberately. `server.tool` disambiguates its overloads
   * by testing whether the argument after the description is a Zod raw shape
   * (sdk/dist/cjs/server/mcp.js:674-682); a literal `{}` is ambiguous there and
   * can be taken for the ANNOTATIONS slot instead. Omitting it entirely leaves
   * only `(name, description, cb)`, which has one reading.
   */
  server.tool(
    'list_programs_and_skills',
    LIST_PROGRAMS_AND_SKILLS_DESCRIPTION,
    async () => runTool('list_programs_and_skills', listProgramsAndSkills, {}, deps)
  );

  server.tool(
    'search_courses',
    SEARCH_COURSES_DESCRIPTION,
    {
      query: z.string().trim().min(1).max(100).optional()
        .describe('Keyword matched against course name, id, teaser and program name.'),
      program: z.string().trim().max(60).optional()
        .describe('Program id from list_programs_and_skills. An unknown value is rejected.'),
      skill: z.string().trim().max(60).optional()
        .describe('Skill id from list_programs_and_skills. An unknown value is rejected.'),
      type: z.enum(['public', 'online', 'all']).default('all')
        .describe('public = classroom courses, online = self-paced, all = both.'),
      limit: z.number().int().min(1).max(SEARCH_COURSES_LIMIT_MAX).default(SEARCH_COURSES_LIMIT_DEFAULT)
        .describe(`Maximum courses to return (max ${SEARCH_COURSES_LIMIT_MAX}).`),
    },
    async (args) => runTool('search_courses', searchCourses, args, deps)
  );

  server.tool(
    'get_course_detail',
    GET_COURSE_DETAIL_DESCRIPTION,
    {
      course_id: z.string().trim().min(1).max(60)
        .describe('The course id, e.g. "POWER-BI-ADV". Matched without regard to case.'),
      include_outline: z.boolean().default(true)
        .describe('Include the full topic outline. Set false for a much smaller answer.'),
    },
    async (args) => runTool('get_course_detail', getCourseDetail, args, deps)
  );

  server.tool(
    'list_training_rounds',
    LIST_TRAINING_ROUNDS_DESCRIPTION,
    {
      course_id: z.string().trim().max(60).optional()
        .describe('Restrict to one course. Matched without regard to case.'),
      from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Earliest training day, YYYY-MM-DD.'),
      to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Latest training day, YYYY-MM-DD.'),
      include_in_progress: z.boolean().default(false)
        .describe('Also return rounds that have already begun. They cannot be registered for.'),
      limit: z.number().int().min(1).max(LIST_TRAINING_ROUNDS_LIMIT_MAX).default(LIST_TRAINING_ROUNDS_LIMIT_DEFAULT)
        .describe(`Maximum rounds to return (max ${LIST_TRAINING_ROUNDS_LIMIT_MAX}).`),
    },
    async (args) => runTool('list_training_rounds', listTrainingRounds, args, deps)
  );

  server.tool(
    'list_live_promotions',
    LIST_LIVE_PROMOTIONS_DESCRIPTION,
    {
      kind: z.enum(['early_bird', 'page', 'all']).default('all')
        .describe('Narrow to priced early-bird offers, or to promotional landing pages.'),
    },
    async (args) => runTool('list_live_promotions', listLivePromotions, args, deps)
  );

  return server;
}

/** Every tool name this server exposes. Used by the suite to pin the count. */
export const MCP_TOOL_NAMES = [
  'list_programs_and_skills',
  'search_courses',
  'get_course_detail',
  'list_training_rounds',
  'list_live_promotions',
];
