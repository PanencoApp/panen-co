import type { TopPlayer } from "@/types";

export function Top50({ players }: { players: TopPlayer[] }) {
  return (
    <section className="rounded-3xl border border-[#d9e1ea] bg-white p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg font-black">Top 50 semaine</h2>
        <span className="text-right text-[11px] font-black uppercase text-[#697386]">
          21 au 28 mai · reset dimanche 00:00
        </span>
      </div>
      <div className="grid max-h-[420px] gap-2 overflow-auto pr-1">
        {players.map((player) => (
          <div
            className={
              (player.isCurrentUser
                ? "border-[#00baff] bg-[#00baff]/15 shadow-[0_0_28px_rgba(0,186,255,.18)]"
                : "border-[#d9e1ea] bg-[#eef3f8]") +
              " grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-2xl border p-3"
            }
            key={player.rank}
          >
            <strong className="text-[#00baff]">{player.rank}</strong>
            <span
              className={
                player.isCurrentUser
                  ? "font-black uppercase text-[#00baff] drop-shadow-[0_0_14px_rgba(0,186,255,.28)]"
                  : "font-black"
              }
            >
              {player.pseudo}
            </span>
            <span className="text-right">
              <b className="block rounded-2xl bg-[#00baff] px-3 py-2 text-lg font-black text-black shadow-[0_0_20px_rgba(0,186,255,.24)]">
                {player.points} pts
              </b>
              <small className="mt-1 block text-xs font-black text-emerald-600">
                +{player.reward} &euro;
              </small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
