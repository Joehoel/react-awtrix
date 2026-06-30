import { App, Bitmap } from "react-awtrix";
import { setAppStatus } from "./app-status.ts";
import { authenticatedFetch } from "./credentials/auth.ts";
import { useApiData } from "./use-api-data.ts";

interface ContributionDay {
  date: string;
  weekday: number;
  contributionCount: number;
  contributionLevel: "NONE" | "FIRST_QUARTILE" | "SECOND_QUARTILE" | "THIRD_QUARTILE" | "FOURTH_QUARTILE";
  color: string;
}

interface ContributionWeek {
  contributionDays: ContributionDay[];
}

type GraphDay = Omit<ContributionDay, "color"> & { x: number; color: number };

interface GitHubContributionResponse {
  data?: {
    viewer?: {
      contributionsCollection?: {
        contributionCalendar?: {
          weeks?: ContributionWeek[];
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

const contributionQuery = `
query ViewerContributionCalendar {
  viewer {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            weekday
            contributionCount
            contributionLevel
            color
          }
        }
      }
    }
  }
}`;

const appName = "github";
const refreshIntervalMs = 6 * 60 * 60 * 1000;
const palette: Record<ContributionDay["contributionLevel"], number> = {
  NONE: 0x07111f,
  FIRST_QUARTILE: 0x35f07b,
  SECOND_QUARTILE: 0x00c853,
  THIRD_QUARTILE: 0x00a33f,
  FOURTH_QUARTILE: 0xb8ff6a,
};

async function fetchContributions(signal: AbortSignal): Promise<ContributionWeek[]> {
  const body = await authenticatedFetch<GitHubContributionResponse>(appName, "https://api.github.com/graphql", {
    method: "POST",
    signal,
    headers: {
      Accept: "application/vnd.github+json",
    },
    body: { query: contributionQuery },
  });

  if (body.errors !== undefined) {
    throw new Error(body.errors.map((error) => error.message).join(", "));
  }

  return body.data?.viewer?.contributionsCollection?.contributionCalendar?.weeks ?? [];
}

function latestMatrix(weeks: ContributionWeek[]): GraphDay[] {
  return weeks.slice(-32).flatMap((week, weekIndex) =>
    week.contributionDays.map((day) => ({
      ...day,
      weekday: Math.min(6, Math.max(0, day.weekday)),
      contributionCount: day.contributionCount,
      date: day.date,
      color: palette[day.contributionLevel],
      x: weekIndex,
    })),
  );
}

function bitmapData(days: GraphDay[]): number[] {
  const data = Array.from({ length: 32 * 7 }, () => palette.NONE);

  for (const day of days) {
    data[day.weekday * 32 + day.x] = day.color;
  }

  return data;
}

function levelCounts(
  days: Array<Pick<ContributionDay, "contributionLevel">>,
): Record<ContributionDay["contributionLevel"], number> {
  return days.reduce(
    (counts, day) => {
      counts[day.contributionLevel] += 1;
      return counts;
    },
    { NONE: 0, FIRST_QUARTILE: 0, SECOND_QUARTILE: 0, THIRD_QUARTILE: 0, FOURTH_QUARTILE: 0 },
  );
}

export function GitHubContributionGraph() {
  const { data: days } = useApiData<GraphDay[]>(
    appName,
    async (signal) => {
      const weeks = await fetchContributions(signal);
      const nextDays = latestMatrix(weeks);
      setAppStatus(appName, "ready", `Loaded ${nextDays.length} contribution pixels.`, {
        weeks: weeks.length,
        pixels: nextDays.length,
        activePixels: nextDays.filter((day) => day.contributionLevel !== "NONE").length,
        ...levelCounts(nextDays),
      });
      return nextDays;
    },
    { intervalMs: refreshIntervalMs },
  );

  if (days === undefined) {
    return null;
  }

  return (
    <App duration={10} background="#000000">
      <Bitmap x={0} y={0} width={32} height={7} data={bitmapData(days)} />
    </App>
  );
}
