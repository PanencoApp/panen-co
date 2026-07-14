type HeaderProps = {
  title: string;
  subtitle: string;
  right: string;
  onBack: () => void;
};

export function Header({ title, subtitle, right, onBack }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 -mx-4 grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-[#00baff]/20 bg-white/90 px-4 py-3 backdrop-blur-xl">
      <button
        className="h-11 rounded-2xl border border-[#00baff]/40 text-xl text-[#00baff]"
        onClick={onBack}
        type="button"
      >
        &larr;
      </button>
      <div>
        <strong className="block">{title}</strong>
        <span className="text-xs font-black uppercase text-[#697386]">
          {subtitle}
        </span>
      </div>
      <p className="font-black">{right}</p>
    </header>
  );
}
