// Example widget: a clock that also shows the current temperature pulled live
// from Home Assistant. Swap `weather.home` for any entity in your instance.
import { useEffect, useState } from "react";
import { App, Rect, Text } from "react-awtrix";
import { useEntity } from "./ha.tsx";

function hhmm(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function WeatherClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const weather = useEntity("weather.home");
  const temperature = weather?.attributes?.temperature as number | undefined;

  return (
    <App icon="66" duration={10} background="#000814">
      <Rect x={0} y={0} width={32} height={8} color="#000814" filled />
      <Text x={1} y={1} color="#7FDBFF">
        {hhmm(now)}
      </Text>
      {temperature !== undefined && (
        <Text x={21} y={1} color="#FFD166">
          {Math.round(temperature)}
        </Text>
      )}
    </App>
  );
}
