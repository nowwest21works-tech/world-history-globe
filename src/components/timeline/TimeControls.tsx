"use client";

import type { AstroYear } from "@/types/event";
import { MAX_YEAR, MIN_YEAR, TICKS, sliderToYear, yearToSlider } from "@/lib/timeScale";
import { formatYear } from "@/lib/year";

const RES = 1000;

export interface TimeControlsProps {
  year: AstroYear;
  playing: boolean;
  speed: number;
  follow: boolean;
  onYear: (y: AstroYear) => void;
  onTogglePlay: () => void;
  onSpeed: (s: number) => void;
  onFollow: (f: boolean) => void;
  /** ツアー中は自動再生を使わない */
  playDisabled?: boolean;
}

export function TimeControls(p: TimeControlsProps) {
  return (
    <div className="time-controls">
      <div className="play-row">
        <button
          type="button"
          className="play-btn"
          onClick={p.onTogglePlay}
          aria-label={p.playing ? "一時停止" : "自動再生"}
          title={p.playDisabled ? "ツアー中は自動再生を使えません" : undefined}
          disabled={p.playDisabled}
          data-testid="play"
        >
          {p.playing ? "❚❚" : "▶"}
        </button>
        <label className="speed">
          <span className="visually-hidden">再生速度</span>
          <select value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))} aria-label="再生速度">
            <option value={1}>×1</option>
            <option value={2}>×2</option>
            <option value={4}>×4</option>
          </select>
        </label>
        <label className="follow">
          <input type="checkbox" checked={p.follow} onChange={(e) => p.onFollow(e.target.checked)} />
          カメラ追従
        </label>
      </div>
      <div className="slider-wrap">
        <input
          type="range"
          className="slider"
          min={0}
          max={RES}
          step={1}
          value={Math.round(yearToSlider(p.year) * RES)}
          onChange={(e) => p.onYear(sliderToYear(Number(e.target.value) / RES))}
          aria-label="年代"
          aria-valuetext={formatYear(p.year)}
          data-testid="year-slider"
        />
        <div className="ticks" aria-hidden="true">
          {TICKS.filter((t) => t >= MIN_YEAR && t <= MAX_YEAR).map((t) => (
            <span key={t} style={{ left: `${yearToSlider(t) * 100}%` }}>
              {formatYear(t).replace("年", "")}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
