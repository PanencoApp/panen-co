import type { TopPlayer } from "@/types";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function currentWeekLabel() {
  const today = new Date();
  const day = today.getDay() === 0 ? 7 : today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return `${formatDate(monday)} au ${formatDate(sunday)}`;
}

export function Top50({
  players,
  userPoints,
}: {
  players: TopPlayer[];
  userPoints: number;
}) {
  const currentUser = players.find((player) => player.isCurrentUser);
  const fiftiethPlayer = players.find((player) => player.rank === 50);
  const displayedPoints = Math.max(userPoints, currentUser?.points ?? 0);
  const pointsToTop50 = Math.max(
    0,
    (fiftiethPlayer?.points ?? 0) - displayedPoints + 1,
  );

  return (
    <section className="rounded-3xl border border-[#d9e1ea] bg-white p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg font-black">Top 50 semaine</h2>
        <span className="text-right text-[11px] font-black uppercase text-[#697386]">
          {currentWeekLabel()} - reset dimanche 00:00
        </span>
      </div>
      <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-[#00baff]/40 bg-[#eefaff] p-3">
        <div>
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#4e596b]">
            Ton score actuel
          </span>
          <strong className="mt-1 block text-3xl font-black text-[#00baff]">
            {displayedPoints} pts
          </strong>
        </div>
        <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-[0_8px_18px_rgba(15,23,42,.08)]">
          <span className="block text-[11px] font-black uppercase text-[#697386]">
            {currentUser ? "Ton rang" : "Points manquants"}
          </span>
          <b className="text-sm font-black text-[#0b0f19]">
            {currentUser ? `${currentUser.rank}` : `${pointsToTop50} pts`}
          </b>
        </div>
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
              <small className="mt-1 block rounded-full border border-[#d9e1ea] bg-white px-2 py-1 text-xs font-black text-[#0b0f19] shadow-[0_8px_18px_rgba(15,23,42,.08)]">
                +{player.reward} &euro;
              </small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
