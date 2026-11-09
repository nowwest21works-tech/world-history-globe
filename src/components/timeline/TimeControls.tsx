"use client";

import type { ReactNode } from "react";
import type { AstroYear, Scope } from "@/types/event";
import { TIME_SCALES } from "@/lib/timeScale";
import { ERA_NOTE, JAPAN_ERAS } from "@/lib/japanEras";
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
  /** 年代の目盛り（世界と日本で範囲と目盛りが違う） */
  mode?: Scope;
  /** 再生ボタンの並びの右端に添えるもの（スマホのマホロバ学校へ戻るリンク） */
  trailing?: ReactNode;
}

/** 目盛りの年の短い表示（「前30000年」→「前3万」） */
function tickLabel(y: AstroYear): string {
  const s = formatYear(y).replace("年", "");
  return s.replace(/^前(\d+)0000$/, "前$1万");
}

export function TimeControls(p: TimeControlsProps) {
  const mode = p.mode ?? "world";
  const scale = TIME_SCALES[mode];
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
        {p.trailing}
      </div>
      <div className={`slider-wrap${mode === "japan" ? " has-eras" : ""}`}>
        {mode === "japan" && (
          // 時代区分は目安（境目には諸説ある）。薄い帯で添える
          <div className="eras" title={ERA_NOTE} data-testid="era-bands">
            {JAPAN_ERAS.map((e) => {
              const l = scale.yearToSlider(e.from);
              const r = scale.yearToSlider(e.to);
              return (
                <span
                  key={e.name}
                  className="era"
                  style={{ left: `${l * 100}%`, width: `${(r - l) * 100}%` }}
                  data-era={e.name}
                >
                  <span className="era-name">{e.name}</span>
                </span>
              );
            })}
          </div>
        )}
        <input
          type="range"
          className="slider"
          min={0}
          max={RES}
          step={1}
          value={Math.round(scale.yearToSlider(p.year) * RES)}
          onChange={(e) => p.onYear(scale.sliderToYear(Number(e.target.value) / RES))}
          aria-label="年代"
          aria-valuetext={formatYear(p.year)}
          data-testid="year-slider"
        />
        <div className="ticks" aria-hidden="true">
          {scale.ticks
            .filter((t) => t >= scale.min && t <= scale.max)
            .map((t) => (
              <span key={t} style={{ left: `${scale.yearToSlider(t) * 100}%` }}>
                {tickLabel(t)}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
