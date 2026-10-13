export function LandingLogo({ tone = 'brand' }: { tone?: 'brand' | 'white' }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}feblio-logo-transparent.png`}
      alt="Feblio"
      width={2103}
      height={748}
      className={`block h-auto w-48 max-w-full shrink-0 sm:w-56 ${tone === 'white' ? 'brightness-0 invert' : ''}`}
    />
  )
}
