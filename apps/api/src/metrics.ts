import type { DayMetrics, MachineMetrics, MetricsResponse } from "@uat/shared";
import { sql } from "drizzle-orm";
import type { Database } from "./db/index.ts";
import { user } from "./db/auth-schema.ts";
import { excludedPlayers, observations, rejectedQueries, runs, submissions } from "./db/schema.ts";
import type { LoadedLevel } from "./levels.ts";

/**
 * The admin metrics page (`GET /api/admin/metrics`): what players have done,
 * per machine and per day, between two UTC days (both included). Counted in
 * Postgres with GROUP BY, so only small totals come back, never rows.
 *
 * The per-machine totals and the daily chart cover exactly the same span:
 * from midnight UTC at the start of `from` to midnight UTC after `to`.
 * Admins (`excluded_players`) are left out, as from every global figure.
 * Every version of a machine counts: this measures activity, not results.
 */

type Row = Record<string, unknown>;
const toCount = (value: unknown) => Number(value ?? 0);

export function createMetrics({ db, levels }: { db: Database; levels: readonly LoadedLevel[] }) {
  /** `from` and `to` are `YYYY-MM-DD`, checked by `metricsQuerySchema`. */
  async function getMetrics(from: string, to: string): Promise<MetricsResponse> {
    // The range as two moments: midnight UTC starting `from`, and the
    // midnight after `to`, which is not included.
    const since = sql`(${from}::date::timestamp at time zone 'UTC')`;
    const until = sql`((${to}::date + 1)::timestamp at time zone 'UTC')`;
    const notAdmin = (column: unknown) =>
      sql`${column} not in (select ${excludedPlayers.userId} from ${excludedPlayers})`;
    const inRange = (table: { createdAt: unknown; userId: unknown }) =>
      sql`${table.createdAt} >= ${since} and ${table.createdAt} < ${until} and ${notAdmin(table.userId)}`;

    const [observed, rejected, ran, judged, players, solvers, daily] = await Promise.all([
      db.execute<Row>(sql`
        select ${observations.levelId} as level_id, ${observations.source} as source, count(*) as n
        from ${observations} where ${inRange(observations)}
        group by 1, 2`),
      db.execute<Row>(sql`
        select ${rejectedQueries.levelId} as level_id, count(*) as n
        from ${rejectedQueries} where ${inRange(rejectedQueries)}
        group by 1`),
      db.execute<Row>(sql`
        select ${runs.levelId} as level_id, count(*) as n,
               count(*) filter (where ${runs.compiled}) as compiled
        from ${runs} where ${inRange(runs)}
        group by 1`),
      db.execute<Row>(sql`
        select ${submissions.levelId} as level_id, ${submissions.verdict} as verdict, count(*) as n
        from ${submissions} where ${inRange(submissions)} and ${submissions.verdict} <> 'pending'
        group by 1, 2`),
      // Anyone who did anything on the machine, counted once.
      db.execute<Row>(sql`
        select level_id, count(distinct user_id) as n from (
          select ${observations.levelId} as level_id, ${observations.userId} as user_id
            from ${observations} where ${inRange(observations)}
          union all
          select ${rejectedQueries.levelId}, ${rejectedQueries.userId}
            from ${rejectedQueries} where ${inRange(rejectedQueries)}
          union all
          select ${runs.levelId}, ${runs.userId} from ${runs} where ${inRange(runs)}
          union all
          select ${submissions.levelId}, ${submissions.userId} from ${submissions} where ${inRange(submissions)}
        ) as activity
        group by 1`),
      // Each player's first accepted submission on each machine, ever; counted
      // if it falls in the range. Later solves (or other versions) do not count again.
      db.execute<Row>(sql`
        select level_id, count(*) as n from (
          select distinct on (${submissions.userId}, ${submissions.levelId})
                 ${submissions.levelId} as level_id, ${submissions.createdAt} as created_at
          from ${submissions}
          where ${submissions.verdict} = 'accepted' and ${notAdmin(submissions.userId)}
          order by ${submissions.userId}, ${submissions.levelId}, ${submissions.createdAt}
        ) as firsts
        where created_at >= ${since} and created_at < ${until}
        group by 1`),
      // One row per day, zeros included. Each kind of activity is grouped by
      // day on its own, then joined to the list of days. Better Auth's
      // created_at has no time zone (it holds UTC), unlike our tables.
      db.execute<Row>(sql`
        with days as (
          select generate_series(${from}::date, ${to}::date, interval '1 day')::date as day
        ),
        visitors as (
          select ${user.createdAt}::date as day, count(*) as n from ${user}
          where ${user.createdAt} >= ${from}::date and ${user.createdAt} < ${to}::date + 1
            and ${notAdmin(user.id)}
          group by 1
        ),
        queries as (
          select (${observations.createdAt} at time zone 'UTC')::date as day, count(*) as n
          from ${observations} where ${inRange(observations)} and ${observations.source} = 'query'
          group by 1
        ),
        ran as (
          select (${runs.createdAt} at time zone 'UTC')::date as day, count(*) as n
          from ${runs} where ${inRange(runs)}
          group by 1
        ),
        judged as (
          select (${submissions.createdAt} at time zone 'UTC')::date as day, count(*) as n,
                 count(*) filter (where ${submissions.verdict} = 'accepted') as accepted
          from ${submissions} where ${inRange(submissions)} and ${submissions.verdict} <> 'pending'
          group by 1
        ),
        active as (
          select day, count(distinct user_id) as n from (
            select (${observations.createdAt} at time zone 'UTC')::date as day, ${observations.userId} as user_id
              from ${observations} where ${inRange(observations)}
            union all
            select (${rejectedQueries.createdAt} at time zone 'UTC')::date, ${rejectedQueries.userId}
              from ${rejectedQueries} where ${inRange(rejectedQueries)}
            union all
            select (${runs.createdAt} at time zone 'UTC')::date, ${runs.userId} from ${runs} where ${inRange(runs)}
            union all
            select (${submissions.createdAt} at time zone 'UTC')::date, ${submissions.userId}
              from ${submissions} where ${inRange(submissions)}
          ) as activity
          group by 1
        )
        select to_char(days.day, 'YYYY-MM-DD') as day,
               visitors.n as visitors, active.n as active_players, queries.n as queries,
               ran.n as runs, judged.n as submissions, judged.accepted as accepted
        from days
        left join visitors using (day)
        left join active using (day)
        left join queries using (day)
        left join ran using (day)
        left join judged using (day)
        order by days.day`),
    ]);

    /** Rows of a grouped query, by level id. */
    const byLevel = (rows: Iterable<Row>) => {
      const map = new Map<string, Row[]>();
      for (const row of rows) {
        const id = String(row.level_id);
        map.set(id, [...(map.get(id) ?? []), row]);
      }
      return map;
    };
    const [observedBy, rejectedBy, ranBy, judgedBy, playersBy, solversBy] = [
      observed,
      rejected,
      ran,
      judged,
      players,
      solvers,
    ].map(byLevel);

    const machines: MachineMetrics[] = levels.map(({ level }) => {
      const id = level.id;
      const sourceCount = (source: string) =>
        toCount(observedBy!.get(id)?.find((row) => row.source === source)?.n);
      const verdictCount = (verdict: string) =>
        toCount(judgedBy!.get(id)?.find((row) => row.verdict === verdict)?.n);
      const runRow = ranBy!.get(id)?.[0];
      return {
        number: level.number,
        title: level.title,
        players: toCount(playersBy!.get(id)?.[0]?.n),
        solvers: toCount(solversBy!.get(id)?.[0]?.n),
        queries: sourceCount("query"),
        rejected: toCount(rejectedBy!.get(id)?.[0]?.n),
        revealed: sourceCount("revealed"),
        runs: toCount(runRow?.n),
        runsCompiled: toCount(runRow?.compiled),
        submissions: {
          accepted: verdictCount("accepted"),
          wrong_answer: verdictCount("wrong_answer"),
          runtime_error: verdictCount("runtime_error"),
          time_limit: verdictCount("time_limit"),
          compile_error: verdictCount("compile_error"),
          judge_error: verdictCount("judge_error"),
        },
      };
    });

    const perDay: DayMetrics[] = [...daily].map((row) => ({
      day: String(row.day),
      visitors: toCount(row.visitors),
      activePlayers: toCount(row.active_players),
      queries: toCount(row.queries),
      runs: toCount(row.runs),
      submissions: toCount(row.submissions),
      accepted: toCount(row.accepted),
    }));

    return { from, to, machines, daily: perDay };
  }

  return { getMetrics };
}
