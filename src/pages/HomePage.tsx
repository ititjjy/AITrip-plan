import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  searchDestinations,
  groupDomesticByLetter,
  groupInternationalByContinent,
  getDomesticLetters,
  quickSearchTags,
  type DestinationCity,
  type ContinentGroup,
  type CountrySection,
} from '@/data/destinations'
import {
  Search, Compass, MapPin, Flame, ArrowRight,
  Menu, X, User, BookOpen, LogIn, ChevronDown, ChevronRight, Sparkles,
  Globe,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════
 * HomePage – Search-first design with destination recommendations
 * Screen 1: Centered search (primary CTA)
 * Screen 2: Domestic / International recommendations with tabs
 * ═══════════════════════════════════════════════════════════════════ */

export default function HomePage() {
  const { dispatch } = useApp()
  const { user, requireAuth } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  /* ── Search state ── */
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /* ── Tab state ── */
  const [activeTab, setActiveTab] = useState<'domestic' | 'international'>('domestic')

  /* ── International expand state ── */
  const [selectedContinent, setSelectedContinent] = useState<string>('亚洲')
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set())

  /* ── Domestic letter scroll ── */
  const [activeLetter, setActiveLetter] = useState<string | null>(null)
  const letterRefs = useRef<Record<string, HTMLDivElement | null>>({})

  /* ── Computed data ── */
  const searchResults = useMemo(
    () => (searchQuery.trim() ? searchDestinations(searchQuery).slice(0, 12) : []),
    [searchQuery],
  )
  const domesticGroups = useMemo(() => groupDomesticByLetter(), [])
  const continentGroups = useMemo(() => groupInternationalByContinent(), [])
  const domesticLetters = useMemo(() => getDomesticLetters(), [])

  /* ── Click outside to close search ── */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  /* ── Navigation helpers ── */
  const goProfile = () => {
    if (requireAuth('登录后即可访问个人中心', () => dispatch({ type: 'SET_VIEW', payload: 'profile' }))) {
      dispatch({ type: 'SET_VIEW', payload: 'profile' })
    }
  }

  const goToCity = useCallback((city: DestinationCity) => {
    dispatch({ type: 'PRE_SELECT_CITY', payload: city.id })
    dispatch({ type: 'SET_VIEW', payload: 'create' })
    setSearchQuery('')
    setSearchFocused(false)
  }, [dispatch])

  const toggleCountry = (country: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev)
      if (next.has(country)) next.delete(country)
      else next.add(country)
      return next
    })
  }

  const scrollToLetter = (letter: string) => {
    setActiveLetter(letter)
    const el = letterRefs.current[letter]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleQuickTag = (query: string) => {
    setSearchQuery(query)
    setSearchFocused(true)
    inputRef.current?.focus()
  }

  /* ── Hotness color helper ── */
  const hotnessColor = (h: number) => {
    if (h >= 90) return 'text-red-500'
    if (h >= 80) return 'text-orange-500'
    if (h >= 70) return 'text-amber-500'
    return 'text-yellow-600'
  }

  const hotnessBarColor = (h: number) => {
    if (h >= 90) return 'bg-gradient-to-r from-red-400 to-red-500'
    if (h >= 80) return 'bg-gradient-to-r from-orange-400 to-orange-500'
    if (h >= 70) return 'bg-gradient-to-r from-amber-400 to-amber-500'
    return 'bg-gradient-to-r from-yellow-400 to-yellow-500'
  }

  /* ────────────────────── Render ────────────────────── */

  return (
    <div className="min-h-screen bg-background">
      {/* ════════════ Navigation ════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-12">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl gradient-hero">
              <Compass className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-bold text-foreground sm:text-lg">智游旅行</span>
          </div>
          {/* Desktop nav */}
          <div className="hidden items-center gap-5 md:flex">
            <span
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'travel-notes' })}
              className="cursor-pointer text-sm font-medium text-muted-foreground transition-smooth hover:text-foreground"
            >
              旅行灵感
            </span>
            <div className="h-4 w-px bg-border" />
            {user ? (
              <button
                onClick={goProfile}
                className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-foreground transition-smooth hover:bg-secondary/80"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full gradient-hero text-[9px] font-bold text-primary-foreground">
                  {user.nickname?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
                </div>
                {user.nickname || '个人中心'}
              </button>
            ) : (
              <button
                onClick={goProfile}
                className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-foreground transition-smooth hover:bg-secondary/80"
              >
                <LogIn className="h-3.5 w-3.5" /> 登录
              </button>
            )}
          </div>
          {/* Mobile menu */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground md:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-border/50 px-4 pb-3 md:hidden animate-fade-in">
            <button onClick={() => { dispatch({ type: 'SET_VIEW', payload: 'travel-notes' }); setMobileMenuOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground">
              <BookOpen className="h-4 w-4" /> 旅行灵感
            </button>
            <button onClick={() => { goProfile(); setMobileMenuOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground">
              <User className="h-4 w-4" /> {user ? '个人中心' : '登录 / 注册'}
            </button>
          </div>
        )}
      </nav>

      {/* ════════════ Screen 1: Search Hero ════════════ */}
      <section className="relative flex min-h-[100svh] flex-col items-center justify-center px-5 pt-14">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 -left-40 h-80 w-80 rounded-full bg-coral-light/40 blur-3xl" />
          <div className="absolute bottom-32 -right-20 h-64 w-64 rounded-full bg-sunset-light/50 blur-3xl" />
          <div className="absolute top-1/3 right-1/4 h-48 w-48 rounded-full bg-ocean-light/30 blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-2xl text-center">
          {/* Brand */}
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-hero shadow-elegant sm:h-16 sm:w-16">
              <Sparkles className="h-7 w-7 text-primary-foreground sm:h-8 sm:w-8" />
            </div>
          </div>
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            发现你的下一段
            <span className="gradient-text">旅程</span>
          </h1>
          <p className="mb-8 text-sm text-muted-foreground sm:text-base md:text-lg">
            AI 智能规划行程，让每一次出发都恰到好处
          </p>

          {/* Search Bar */}
          <div ref={searchRef} className="relative mx-auto max-w-xl">
            <div className={`relative flex items-center rounded-2xl border-2 bg-card shadow-card transition-all duration-300 ${
              searchFocused
                ? 'border-primary shadow-elegant ring-4 ring-primary/10'
                : 'border-border hover:border-primary/30 hover:shadow-card-hover'
            }`}>
              <Search className="ml-5 h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                placeholder="告诉小智，你想去哪里玩"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className="h-14 w-full bg-transparent px-4 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none sm:h-16 sm:text-lg"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); inputRef.current?.focus() }}
                  className="mr-3 rounded-full p-1.5 text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {!searchQuery && (
                <div className="mr-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gradient-hero">
                  <ArrowRight className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchFocused && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-border bg-card shadow-card-hover animate-fade-in">
                <div className="p-2">
                  {searchResults.map(({ city }) => (
                    <button
                      key={city.id}
                      onClick={() => goToCity(city)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-smooth hover:bg-secondary"
                    >
                      <img
                        src={city.image}
                        alt={city.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{city.name}</span>
                          <span className="text-xs text-muted-foreground">{city.nameEn}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {city.countryFlag} {city.country}
                          </span>
                          <span>·</span>
                          <span>¥{city.avgDailyBudget}/天</span>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1 text-xs font-bold ${hotnessColor(city.hotness)}`}>
                        <Flame className="h-3.5 w-3.5" />
                        {city.hotness}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {searchFocused && searchQuery.trim() && searchResults.length === 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-border bg-card px-6 py-8 text-center shadow-card-hover animate-fade-in">
                <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">暂未收录该目的地</p>
                <p className="mt-1 text-xs text-muted-foreground">试试其他关键词，如 "日本"、"海岛"、"巴黎"</p>
              </div>
            )}
          </div>

          {/* Quick Tags */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground/60 mr-1">热门：</span>
            {quickSearchTags.map((tag) => (
              <button
                key={tag.query}
                onClick={() => handleQuickTag(tag.query)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:text-foreground hover:shadow-card"
              >
                <span>{tag.emoji}</span>
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 flex flex-col items-center gap-2 animate-float">
          <span className="text-[10px] text-muted-foreground/50 font-medium tracking-wide">滑动探索更多</span>
          <div className="h-8 w-5 rounded-full border-2 border-muted-foreground/20 p-0.5">
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 mx-auto animate-pulse-soft" />
          </div>
        </div>
      </section>

      {/* ════════════ Screen 2: Destination Recommendations ════════════ */}
      <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-12">
        <div className="mx-auto max-w-7xl">
          {/* Section Header */}
          <div className="mb-8 text-center sm:mb-10">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-coral-light px-4 py-1.5 text-xs font-semibold text-coral-dark">
              <Flame className="h-3.5 w-3.5" />
              当月热门推荐
            </div>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
              发现热门旅行目的地
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              精选国内外当季最热门旅游城市，开启你的旅行灵感
            </p>
          </div>

          {/* Tab Bar */}
          <div className="mb-8 flex items-center justify-center">
            <div className="inline-flex rounded-2xl bg-secondary p-1">
              <button
                onClick={() => setActiveTab('domestic')}
                className={`relative rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${
                  activeTab === 'domestic'
                    ? 'bg-card text-foreground shadow-card'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                🇨🇳 国内热门
              </button>
              <button
                onClick={() => setActiveTab('international')}
                className={`relative rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${
                  activeTab === 'international'
                    ? 'bg-card text-foreground shadow-card'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                🌏 国际热门
              </button>
            </div>
          </div>

          {/* ═══════ Domestic Tab ═══════ */}
          {activeTab === 'domestic' && (
            <div className="animate-fade-in">
              {/* Letter Index Bar */}
              <div className="mb-6 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
                {domesticLetters.map(letter => (
                  <button
                    key={letter}
                    onClick={() => scrollToLetter(letter)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all duration-200 ${
                      activeLetter === letter
                        ? 'gradient-hero text-primary-foreground shadow-elegant'
                        : 'bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    {letter}
                  </button>
                ))}
              </div>

              {/* Letter Groups */}
              <div className="space-y-8">
                {domesticGroups.map(({ letter, cities }) => (
                  <div
                    key={letter}
                    ref={el => { letterRefs.current[letter] = el }}
                    className="scroll-mt-24"
                  >
                    {/* Letter Header */}
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-hero text-sm font-bold text-primary-foreground">
                        {letter}
                      </div>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    {/* City Cards Grid */}
                    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {cities.map(city => (
                        <CityCard key={city.id} city={city} onSelect={goToCity} hotnessColor={hotnessColor} hotnessBarColor={hotnessBarColor} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════ International Tab ═══════ */}
          {activeTab === 'international' && (
            <div className="animate-fade-in space-y-5">
              {/* Continent Tab Bar */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {continentGroups.map((cg) => (
                  <button
                    key={cg.continent}
                    onClick={() => {
                      setSelectedContinent(cg.continent)
                      setExpandedCountries(new Set())
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                      selectedContinent === cg.continent
                        ? 'border-primary bg-primary/10 text-foreground shadow-card'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground hover:-translate-y-0.5 hover:shadow-card'
                    }`}
                  >
                    <span>{cg.continentEmoji}</span>
                    {cg.continent}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      selectedContinent === cg.continent
                        ? 'bg-primary/20 text-primary font-bold'
                        : 'bg-secondary text-muted-foreground'
                    }`}>{cg.totalCities}</span>
                  </button>
                ))}
              </div>

              {/* Selected Continent Content */}
              {continentGroups
                .filter((cg) => cg.continent === selectedContinent)
                .map((cg) => (
                <div key={cg.continent} className="animate-fade-in">
                  {/* Continent Summary */}
                  <div className="mb-4 flex items-center gap-3 px-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-lg">
                      {cg.continentEmoji}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-foreground">{cg.continent}</h3>
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {cg.countries.length} 个国家 · {cg.totalCities} 个城市
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {cg.countries.slice(0, 8).map(c => c.countryFlag).join(' ')}
                        {cg.countries.length > 8 && ` +${cg.countries.length - 8}`}
                      </p>
                    </div>
                  </div>

                  {/* Country List */}
                  <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                    {cg.countries.map((cs) => (
                      <CountrySectionUI
                        key={cs.country}
                        section={cs}
                        expanded={expandedCountries.has(cs.country)}
                        onToggle={() => toggleCountry(cs.country)}
                        onSelectCity={goToCity}
                        hotnessColor={hotnessColor}
                        hotnessBarColor={hotnessBarColor}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ════════════ Footer ════════════ */}
      <footer className="border-t border-border px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Compass className="h-4 w-4 text-primary" />
            <span className="font-medium">智游旅行</span>
            <span>© 2026</span>
          </div>
          <p className="text-xs text-muted-foreground">让每一段旅程都值得期待</p>
        </div>
      </footer>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * Sub-components
 * ═══════════════════════════════════════════════════════════════════ */

/** Compact city card for domestic / international lists */
function CityCard({
  city,
  onSelect,
  hotnessColor,
  hotnessBarColor,
}: {
  city: DestinationCity
  onSelect: (c: DestinationCity) => void
  hotnessColor: (h: number) => string
  hotnessBarColor: (h: number) => string
}) {
  return (
    <button
      onClick={() => onSelect(city)}
      className="group overflow-hidden rounded-2xl border border-border bg-card text-left shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
    >
      {/* Image */}
      <div className="relative h-28 overflow-hidden sm:h-32">
        <img
          src={city.image}
          alt={city.name}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 via-transparent to-transparent" />
        {/* Hotness badge */}
        <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-foreground/60 backdrop-blur-sm px-2 py-0.5">
          <Flame className={`h-3 w-3 ${hotnessColor(city.hotness)}`} />
          <span className="text-[10px] font-bold text-primary-foreground">{city.hotness}</span>
        </div>
        {/* City name overlay */}
        <div className="absolute bottom-2 left-2.5 right-2.5">
          <h3 className="text-sm font-bold text-primary-foreground sm:text-base">{city.name}</h3>
          <p className="text-[10px] text-primary-foreground/70">{city.nameEn}</p>
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5 sm:p-3">
        {/* Hotness bar */}
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-500 ${hotnessBarColor(city.hotness)}`}
              style={{ width: `${city.hotness}%` }}
            />
          </div>
          <span className="text-[10px] font-medium text-muted-foreground">¥{city.avgDailyBudget}/天</span>
        </div>
        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {city.tags.slice(0, 3).map(tag => (
            <span key={tag} className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-secondary-foreground sm:text-[10px]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}

/** Country section within a continent – shows hot cities + pinyin-indexed rest */
function CountrySectionUI({
  section,
  expanded,
  onToggle,
  onSelectCity,
  hotnessColor,
  hotnessBarColor,
}: {
  section: CountrySection
  expanded: boolean
  onToggle: () => void
  onSelectCity: (c: DestinationCity) => void
  hotnessColor: (h: number) => string
  hotnessBarColor: (h: number) => string
}) {
  const hasOtherCities = section.otherByLetter.length > 0

  return (
    <div className="border-b border-border/50 last:border-b-0">
      {/* Country Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-smooth hover:bg-secondary/20"
      >
        <span className="text-xl">{section.countryFlag}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-foreground">{section.country}</h4>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {section.totalCities} 个城市
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="h-1 w-16 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${hotnessBarColor(section.avgHotness)}`}
                style={{ width: `${section.avgHotness}%` }}
              />
            </div>
            <span className={`flex items-center gap-0.5 text-[10px] font-bold ${hotnessColor(section.avgHotness)}`}>
              <Flame className="h-2.5 w-2.5" />
              {section.avgHotness}
            </span>
          </div>
        </div>
        {/* Preview: top city thumbnails */}
        <div className="hidden items-center gap-1 sm:flex">
          {section.hotCities.slice(0, 3).map(c => (
            <img key={c.id} src={c.image} alt={c.name} className="h-8 w-8 rounded-lg object-cover ring-1 ring-border" loading="lazy" />
          ))}
        </div>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/60 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-5 pb-5 pt-1 animate-fade-in">
          {/* Hot Cities Section */}
          <div className="mb-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-red-500/10 to-orange-500/10 px-3 py-1">
                <Flame className="h-3 w-3 text-red-500" />
                <span className="text-[11px] font-bold text-red-600">当季热门</span>
              </div>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {section.hotCities.map(city => (
                <CityCard
                  key={city.id}
                  city={city}
                  onSelect={onSelectCity}
                  hotnessColor={hotnessColor}
                  hotnessBarColor={hotnessBarColor}
                />
              ))}
            </div>
          </div>

          {/* Other Cities by Pinyin Index */}
          {hasOtherCities && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] font-bold text-muted-foreground">更多城市</span>
                </div>
                {/* Inline letter index */}
                <div className="flex flex-wrap items-center gap-0.5">
                  {section.otherByLetter.map(({ letter }) => (
                    <span key={letter} className="flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-muted-foreground/60 hover:text-primary cursor-default">
                      {letter}
                    </span>
                  ))}
                </div>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <div className="space-y-3">
                {section.otherByLetter.map(({ letter, cities }) => (
                  <div key={letter}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-[10px] font-bold text-muted-foreground">
                        {letter}
                      </span>
                      <div className="h-px flex-1 bg-border/30" />
                    </div>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {cities.map(city => (
                        <CityCard
                          key={city.id}
                          city={city}
                          onSelect={onSelectCity}
                          hotnessColor={hotnessColor}
                          hotnessBarColor={hotnessBarColor}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
