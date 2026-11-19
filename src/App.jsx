import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import adelaProfileImage from './img/artist/adéla/icons/adela_profile.jpg';
import arianaGrandeProfileImage from './img/artist/ariana grande/icon/ariana grande icon.jpg';
import slayyyterProfileImage from './img/artist/slayyyter/slayyyter-profile.jpg';
import slayyyterAlbumCover from './img/artist/slayyyter/worstmaninamerica_cover.jpg';
import imagePlaceholder from './img/musicfy-image-placeholder.svg';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

const getArtistFallbackImage = (artist) => {
  const name = String(artist?.name || '').trim().toLocaleLowerCase();
  if (name === 'adéla') return adelaProfileImage;
  if (name === 'ariana grande') return arianaGrandeProfileImage;
  if (name === 'slayyyter') return slayyyterProfileImage;
  return imagePlaceholder;
};

const getReleaseFallbackImage = (release) => (
  String(release?.title || '').trim().toLocaleLowerCase() === 'wor$t girl in america'
    ? slayyyterAlbumCover
    : imagePlaceholder
);

const formatFeedDate = (value) => {
  if (!value) return '';
  const dateValue = String(value);
  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    ? `${dateValue}T12:00:00`
    : dateValue.replace(' ', 'T');
  const parsedDate = new Date(normalizedDate);
  return Number.isNaN(parsedDate.getTime())
    ? String(value)
    : parsedDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
};

const handleImageError = (event, fallbackImage) => {
  const image = event.currentTarget;
  const fallbackUrl = new URL(fallbackImage, window.location.href).toString();
  if (image.src === fallbackUrl) {
    image.removeAttribute('src');
    return;
  }
  image.src = fallbackImage;
};

function ArtworkBackdrop({ src, className }) {
  const canvases = useRef([]);
  const isGif = typeof src === 'string' && (/\.gif(?:$|[?#])/i.test(src) || /^data:image\/gif/i.test(src));
  const [activeFrame, setActiveFrame] = useState(-1);
  const [canvasFailed, setCanvasFailed] = useState(false);

  useEffect(() => {
    setActiveFrame(-1);
    setCanvasFailed(false);
    if (!isGif || !src) return undefined;

    let active = true;
    let currentFrame = 0;
    let timer;
    const image = new Image();
    image.crossOrigin = 'anonymous';

    const drawFrame = (frameIndex) => {
      const canvas = canvases.current[frameIndex];
      if (!canvas || !image.naturalWidth || !image.naturalHeight) return false;

      const width = 320;
      const height = 160;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');

      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      return true;
    };

    image.onload = () => {
      try {
        if (!drawFrame(currentFrame)) throw new Error('Could not render the animated artwork.');
        setActiveFrame(currentFrame);
        timer = window.setInterval(() => {
          try {
            const nextFrame = 1 - currentFrame;
            if (drawFrame(nextFrame)) {
              currentFrame = nextFrame;
              setActiveFrame(nextFrame);
            }
          } catch (error) {
            if (active) {
              window.clearInterval(timer);
              setCanvasFailed(true);
              console.warn('Could not create a slow animated artwork backdrop.', error);
            }
          }
        }, 3500);
      } catch (error) {
        if (active) {
          setCanvasFailed(true);
          console.warn('Could not create a slow animated artwork backdrop.', error);
        }
      }
    };
    image.onerror = () => {
      if (active) {
        setCanvasFailed(true);
        console.warn('Could not load the animated artwork for its backdrop.');
      }
    };
    image.src = src;

    return () => {
      active = false;
      window.clearInterval(timer);
      image.onload = null;
      image.onerror = null;
    };
  }, [src, isGif]);

  return (
    <div className={`artwork-backdrop ${className || ''}`} aria-hidden="true">
      {(!isGif || canvasFailed || activeFrame < 0) && (
        <img className="artwork-backdrop-image" src={src} alt="" />
      )}
      {isGif && !canvasFailed && [0, 1].map((frameIndex) => (
        <canvas
          key={frameIndex}
          ref={(canvas) => { canvases.current[frameIndex] = canvas; }}
          className={`artwork-backdrop-frame${activeFrame === frameIndex ? ' is-visible' : ''}`}
        />
      ))}
    </div>
  );
}

const uploadImage = async (file) => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post('/uploads/image', formData);
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  return new URL(response.data.url, apiOrigin).toString();
};

const AuthContext = createContext();

function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('musicfy-token') || '');
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('musicfy-user');
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem('musicfy-token', token);
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      localStorage.removeItem('musicfy-token');
      delete api.defaults.headers.common.Authorization;
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('musicfy-user', JSON.stringify(user));
    } else {
      localStorage.removeItem('musicfy-user');
    }
  }, [user]);

  const login = (tokenValue, userValue) => {
    setToken(tokenValue);
    setUser(userValue);
  };

  const logout = () => {
    setToken('');
    setUser(null);
  };

  const value = useMemo(() => ({ token, user, login, logout }), [token, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ProtectedRoute({ admin = false, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('musicfy-theme') === 'light' ? 'light' : 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('musicfy-theme', theme);
  }, [theme]);

  return (
    <AuthProvider>
      <div className="app-shell">
        <Navbar
          theme={theme}
          onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        />
        <div className="app-layout">
          <Sidebar />
          <main className="page-shell">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/artists" element={<ArtistsPage />} />
              <Route path="/social" element={<ProtectedRoute><SocialPage /></ProtectedRoute>} />
              <Route path="/community" element={<Navigate to="/social" replace />} />
              <Route path="/artists/:artistId" element={<ArtistDetailPage />} />
              <Route path="/releases/:releaseId" element={<ReleaseDetailPage />} />
              <Route path="/profile/:userId" element={<ProfilePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/admin" element={<ProtectedRoute admin><AdminPage /></ProtectedRoute>} />
            </Routes>
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}

function NavGlyph({ name }) {
  const paths = {
    home: 'M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z M9 21v-7h6v7',
    explore: 'M10.8 18.6a7.8 7.8 0 1 1 5.5-2.3 M16.5 16.5 21 21',
    artists: 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Zm12-2a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Z',
    settings: 'M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4',
    profile: 'M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    social: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-7.5a4 4 0 0 1 0 7.5m2 3a4 4 0 0 1 2 3.5v1',
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}

function Sidebar() {
  const { user } = useAuth();
  const items = [
    { to: '/', label: 'Início', icon: 'home', end: true },
    { to: '/explore', label: 'Explorar', icon: 'explore' },
    { to: '/artists', label: 'Artistas', icon: 'artists' },
    ...(user ? [{ to: '/social', label: 'Social', icon: 'social' }] : []),
    ...(user?.role === 'ADMIN' ? [{ to: '/admin', label: 'Gerenciar', icon: 'settings' }] : []),
    ...(user ? [{ to: `/profile/${user.id}`, label: 'Perfil', icon: 'profile' }] : []),
  ];

  return (
    <aside className="side-dock" aria-label="Navegação principal">
      <nav className="side-dock-links">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `side-dock-link${isActive ? ' is-active' : ''}`}
            title={item.label}
          >
            <NavGlyph name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function Navbar({ theme, onToggleTheme }) {
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }

    let active = true;
    const fetchSearch = async () => {
      try {
        const [artistsRes, releasesRes] = await Promise.all([api.get('/artists'), api.get('/releases')]);
        const matches = [...artistsRes.data, ...releasesRes.data]
          .filter((item) => (item.name || item.title || '').toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6);
        if (active) setResults(matches);
      } catch (error) {
        if (active) setResults([]);
      }
    };

    const timer = setTimeout(fetchSearch, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <header className="topbar glass-panel">
      <div className="brand-wrap">
        <Link to="/" className="brand">MUSICFY</Link>
      </div>

      <div className="search-wrap">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar artistas ou lançamentos" />
        {results.length > 0 && (
          <div className="search-results">
            {results.map((item) => (
              <Link key={item.id + (item.name || item.title)} to={item.name ? `/artists/${item.id}` : `/releases/${item.id}`} onClick={() => setQuery('')}>
                {item.name || item.title}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-account">
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Ativar modo ${theme === 'dark' ? 'claro' : 'escuro'}`}
          aria-pressed={theme === 'light'}
          title={`Ativar modo ${theme === 'dark' ? 'claro' : 'escuro'}`}
        >
          {theme === 'dark' ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" />
            </svg>
          )}
        </button>
        {user ? (
          <>
            <NavLink to={`/profile/${user.id}`} className="account-link">
              <span className="account-avatar">{(user.full_name || user.username || 'U').charAt(0).toUpperCase()}</span>
              <span className="account-name">{user.full_name || user.username}</span>
            </NavLink>
            <button className="logout-btn" onClick={logout}>Sair</button>
          </>
        ) : (
          <NavLink to="/auth" className="login-pill">Entrar</NavLink>
        )}
      </div>
    </header>
  );
}

function HomePage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [recentReleases, setRecentReleases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');

    api.get('/home-feed')
      .then((response) => {
        if (!active) return;
        setReviews(response.data.reviews || []);
        setRecentReleases(response.data.recent_releases || []);
      })
      .catch((requestError) => {
        if (active) {
          setReviews([]);
          setRecentReleases([]);
          setError(requestError.response?.data?.error || 'Não foi possível carregar seu feed.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [user?.id]);

  const handleReviewLikeChange = (reviewId, liked, likeCount) => {
    setReviews((current) => current.map((review) => (
      review.id === reviewId
        ? { ...review, liked_by_user: liked, like_count: likeCount }
        : review
    )));
  };

  return (
    <div className="home-page">
      <section className="home-feed-column">
        <header className="home-feed-heading">
          <div>
            <p className="eyebrow">Música compartilhada</p>
            <h1>Seu feed</h1>
            <p>{user ? 'Resenhas de quem você segue e dos lançamentos que salvou.' : 'Descubra o que as pessoas estão ouvindo.'}</p>
          </div>
          <Link to={user ? '/social' : '/auth'} className="home-network-link">
            {user ? 'Encontrar pessoas' : 'Entrar'}
            <span aria-hidden="true">↗</span>
          </Link>
        </header>

        <Link to="/explore" className="home-review-prompt glass-panel">
          <span className="home-review-prompt-icon" aria-hidden="true">✎</span>
          <span>
            <strong>O que você achou do último álbum que ouviu?</strong>
            <small>Escolha um lançamento e publique sua resenha</small>
          </span>
          <span className="home-review-prompt-arrow" aria-hidden="true">↗</span>
        </Link>

        <section className="home-social-feed" aria-labelledby="home-feed-title">
          <div className="home-feed-section-heading">
            <div>
              <p className="eyebrow">Seu círculo musical</p>
              <h2 id="home-feed-title">Resenhas recentes</h2>
            </div>
            {!isLoading && <span>{reviews.length} {reviews.length === 1 ? 'resenha' : 'resenhas'}</span>}
          </div>

          {error && <p className="error-text" role="alert">{error}</p>}
          {isLoading ? (
            <div className="home-feed-loading glass-panel" aria-live="polite">Carregando seu feed…</div>
          ) : reviews.length ? (
            <div className="home-review-list">
              {reviews.map((review) => (
                <article key={review.id} className="home-review-card glass-panel">
                  <header className="home-review-author-row">
                    <Link to={`/profile/${review.user_id}`} className="home-review-author">
                      <img src={review.avatar_url || imagePlaceholder} onError={(event) => handleImageError(event, imagePlaceholder)} alt="" />
                      <span>
                        <strong>{review.full_name || review.username}</strong>
                        <small>@{review.username} · {formatFeedDate(review.created_at)}</small>
                      </span>
                    </Link>
                    <RatingBadge value={review.rating} />
                  </header>

                  <Link to={`/releases/${review.release_id}`} className="home-review-release">
                    <img src={review.release_cover || imagePlaceholder} onError={(event) => handleImageError(event, imagePlaceholder)} alt="" />
                    <span>
                      <small>RESENHA DE</small>
                      <strong>{review.release_title}</strong>
                      <span>{review.artist_name}</span>
                    </span>
                    <span className="home-review-release-arrow" aria-hidden="true">↗</span>
                  </Link>

                  {review.review_text ? (
                    <p className="home-review-text">{review.review_text}</p>
                  ) : (
                    <p className="home-review-text is-empty">Compartilhou uma nota para este lançamento.</p>
                  )}
                  {review.gif_url && <ReviewGif src={review.gif_url} />}

                  <footer className="home-review-actions">
                    <ReviewLikeButton
                      review={review}
                      user={user}
                      onChange={(liked, likeCount) => handleReviewLikeChange(review.id, liked, likeCount)}
                    />
                    <Link to={`/releases/${review.release_id}`} className="home-review-open-link">Abrir lançamento</Link>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className="home-feed-empty glass-panel">
              <span className="home-empty-mark" aria-hidden="true">♫</span>
              <h3>{user ? 'Seu feed está começando' : 'Ainda não há resenhas por aqui'}</h3>
              <p>{user
                ? 'Siga pessoas ou salve lançamentos para ver novas resenhas neste espaço.'
                : 'Entre para acompanhar pessoas e guardar os lançamentos que você curte.'}
              </p>
              <Link to={user ? '/social' : '/auth'} className="secondary-btn">
                {user ? 'Descobrir pessoas' : 'Entrar no Musicfy'}
              </Link>
            </div>
          )}
        </section>
      </section>

      <aside className="home-right-rail" aria-label="Descobertas musicais">
        <section className="home-recent-panel glass-panel">
          <header className="home-recent-heading">
            <div>
              <p className="eyebrow">Descubra música nova</p>
              <h2>Lançamentos recentes</h2>
            </div>
            <span className="home-recent-window">Últimos 2 meses</span>
          </header>

          {recentReleases.length ? (
            <div className="home-recent-list">
              {recentReleases.map((release) => (
                <Link key={release.id} to={`/releases/${release.id}`} className="home-recent-release">
                  <img src={release.cover_url || getReleaseFallbackImage(release)} onError={(event) => handleImageError(event, getReleaseFallbackImage(release))} alt="" />
                  <span>
                    <small>{release.release_type} · {formatFeedDate(release.release_date)}</small>
                    <strong>{release.title}</strong>
                    <span>{release.artist_name}</span>
                  </span>
                  <span className="home-recent-arrow" aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          ) : !isLoading ? (
            <p className="home-recent-empty">Nenhum lançamento nos últimos dois meses.</p>
          ) : (
            <p className="home-recent-empty">Buscando novidades…</p>
          )}

          <Link to="/explore" className="home-explore-link">Explorar catálogo <span aria-hidden="true">→</span></Link>
        </section>

        <section className="home-social-note glass-panel">
          <span aria-hidden="true">✦</span>
          <p>As resenhas do seu feed vêm das pessoas que você segue e dos álbuns que você salvou.</p>
          {user && <Link to="/social">Monte seu círculo musical <span aria-hidden="true">→</span></Link>}
        </section>
      </aside>
    </div>
  );
}

function ExplorePage() {
  const [data, setData] = useState({ featured: [], recent: [], artists: [], reviews: [] });

  useEffect(() => {
    api.get('/explore').then((res) => setData(res.data)).catch(console.error);
  }, []);

  return (
    <div className="content-stack">
      <div className="section-header">
        <h2>Explorar</h2>
      </div>
      <div className="genre-row">
        {['Pop', 'K-pop', 'R&B', 'Hip-Hop', 'Rap', 'Rock', 'Indie', 'Alternative', 'Electronic', 'Funk', 'MPB', 'Jazz', 'Classical', 'Country'].map((genre) => (
          <span className="genre-pill" key={genre}>{genre}</span>
        ))}
      </div>

      <section className="subsection">
        <h3>Escolhas em destaque</h3>
        <div className="card-grid">
          {data.featured.map((release) => <ReleaseCard key={release.id} release={release} />)}
        </div>
      </section>

      <section className="subsection">
        <h3>Recentes</h3>
        <div className="card-grid">
          {data.recent.map((release) => <ReleaseCard key={release.id} release={release} />)}
        </div>
      </section>
    </div>
  );
}

function ArtistsPage() {
  const [artists, setArtists] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.get('/artists').then((res) => setArtists(res.data)).catch(console.error);
  }, []);

  const filtered = artists.filter((artist) => (artist.name || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="content-stack">
      <div className="section-header">
        <h2>Artistas</h2>
      </div>
      <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar artistas" />
      <div className="artist-grid">
        {filtered.map((artist) => (
          <ArtistCard key={artist.id} artist={artist} />
        ))}
      </div>
    </div>
  );
}

function FollowButton({ userId, initialFollowing = false, onChange }) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(Boolean(initialFollowing));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setFollowing(Boolean(initialFollowing));
  }, [userId, initialFollowing]);

  if (Number(user?.id) === Number(userId)) return null;
  if (!user) {
    return <Link to="/auth" className="follow-btn">Entrar para seguir</Link>;
  }

  const toggleFollow = async () => {
    setIsSaving(true);
    setError('');
    try {
      const response = following
        ? await api.delete(`/users/${userId}/follow`)
        : await api.post(`/users/${userId}/follow`);
      setFollowing(Boolean(response.data.following));
      onChange?.(Boolean(response.data.following));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível atualizar o seguimento.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="follow-control">
      <button
        type="button"
        className={`follow-btn${following ? ' is-following' : ''}`}
        aria-pressed={following}
        disabled={isSaving}
        onClick={toggleFollow}
      >
        {isSaving ? 'Salvando...' : following ? 'Seguindo' : 'Seguir'}
      </button>
      {error && <span className="follow-error" role="alert">{error}</span>}
    </div>
  );
}

function ReviewLikeButton({ review, user, onChange }) {
  const [liked, setLiked] = useState(Boolean(review.liked_by_user));
  const [likeCount, setLikeCount] = useState(Number(review.like_count || 0));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLiked(Boolean(review.liked_by_user));
    setLikeCount(Number(review.like_count || 0));
  }, [review.id, review.liked_by_user, review.like_count]);

  if (!user) {
    return (
      <Link to="/auth" className="review-like-btn">
        ♡ Curtir · {likeCount}
      </Link>
    );
  }

  const toggleLike = async () => {
    setIsSaving(true);
    setError('');
    try {
      const response = await api.post(`/reviews/${review.id}/like`);
      const nextLiked = Boolean(response.data.liked);
      const nextCount = Math.max(0, likeCount + (nextLiked ? 1 : -1));
      setLiked(nextLiked);
      setLikeCount(nextCount);
      onChange?.(nextLiked, nextCount);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível curtir esta resenha.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="review-like-control">
      <button
        type="button"
        className={`review-like-btn${liked ? ' is-liked' : ''}`}
        aria-pressed={liked}
        disabled={isSaving}
        onClick={toggleLike}
      >
        {liked ? '♥ Curtido' : '♡ Curtir'} · {likeCount}
      </button>
      {error && <span className="follow-error" role="alert">{error}</span>}
    </div>
  );
}

function ReviewGif({ src }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) return null;

  return (
    <figure className="review-gif-frame">
      <img src={src} alt="GIF compartilhado na resenha" loading="lazy" onError={() => setHasError(true)} />
    </figure>
  );
}

function SocialPage() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const search = query.trim();
    if (search.length === 1) {
      setUsers([]);
      setError('Digite pelo menos 2 caracteres para buscar pessoas.');
      setIsLoading(false);
      return undefined;
    }

    setError('');
    setIsLoading(true);
    const timer = setTimeout(() => {
      api.get('/users', { params: search ? { q: search } : {} })
        .then((response) => {
          if (active) setUsers(response.data || []);
        })
        .catch((requestError) => {
          if (active) {
            setUsers([]);
            setError(requestError.response?.data?.error || 'Não foi possível carregar as pessoas.');
          }
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="content-stack social-page">
      <header className="social-hero glass-panel">
        <p className="eyebrow">Música fica melhor junto</p>
        <h1>Social</h1>
        <p>Encontre pessoas, acompanhe suas descobertas e compartilhe o que você ouve.</p>
        <label className="social-search">
          <span className="sr-only">Buscar pessoas por nome ou usuário</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou @usuário"
            maxLength={100}
          />
        </label>
      </header>

      <section className="social-results">
        <div className="profile-section-heading">
          <div>
            <p className="eyebrow">{query.trim() ? 'Resultados da busca' : 'Novas conexões'}</p>
            <h2>{query.trim() ? 'Pessoas' : 'Descubra pessoas'}</h2>
          </div>
          {!isLoading && <span className="social-result-count">{users.length} perfis</span>}
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        {isLoading ? (
          <div className="loading-panel">Carregando pessoas…</div>
        ) : users.length ? (
          <div className="social-user-grid">
            {users.map((person) => (
              <article key={person.id} className="social-user-card glass-panel">
                <Link to={`/profile/${person.id}`} className="social-user-link">
                  <img src={person.avatar_url || imagePlaceholder} onError={(event) => handleImageError(event, imagePlaceholder)} alt="" />
                  <span className="social-user-copy">
                    <strong>{person.full_name || person.username}</strong>
                    <small>@{person.username}</small>
                  </span>
                </Link>
                <p>{person.bio || 'Ainda não adicionou uma biografia.'}</p>
                <div className="social-user-footer">
                  <span>{Number(person.follower_count || 0)} seguidores</span>
                  <FollowButton
                    userId={person.id}
                    initialFollowing={Boolean(person.followed_by_user)}
                    onChange={(isFollowing) => setUsers((current) => current.map((item) => (
                      String(item.id) === String(person.id)
                        ? {
                          ...item,
                          follower_count: Math.max(0, Number(item.follower_count || 0) + (isFollowing ? 1 : -1)),
                          followed_by_user: isFollowing,
                        }
                        : item
                    )))}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : !error ? (
          <div className="profile-empty-state glass-panel">
            <span aria-hidden="true">⌕</span>
            <h3>Ninguém encontrado por enquanto</h3>
            <p>Tente buscar por outro nome ou usuário.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ArtistDetailPage() {
  const { artistId } = useParams();
  const { user } = useAuth();
  const [artistData, setArtistData] = useState(null);
  const artistBannerUrl = artistData?.artist?.banner_url || artistData?.artist?.image_url || '';

  useEffect(() => {
    api.get(`/artists/${artistId}`).then((res) => setArtistData(res.data)).catch(console.error);
  }, [artistId]);

  if (!artistData) return <div className="loading-panel">Carregando artista…</div>;

  return (
    <div className="content-stack">
      <div className="artist-hero glass-panel">
        <ArtworkBackdrop src={artistBannerUrl || getArtistFallbackImage(artistData.artist)} className="artist-hero-artwork-glow" />
        <img
          className="artist-hero-media"
          src={artistBannerUrl || getArtistFallbackImage(artistData.artist)}
          onError={(event) => handleImageError(event, getArtistFallbackImage(artistData.artist))}
          alt=""
          aria-hidden="true"
        />
        <div className="artist-header-copy">
          <img src={artistData.artist.image_url || getArtistFallbackImage(artistData.artist)} onError={(event) => handleImageError(event, getArtistFallbackImage(artistData.artist))} alt={artistData.artist.name} />
          <div>
            <p className="eyebrow">Artista</p>
            <h1>{artistData.artist.name}</h1>
            <p className="artist-header-meta">
              {artistData.genres.join(', ') || 'Artista independente'}
              <span aria-hidden="true"> • </span>
              {artistData.releases.length} {artistData.releases.length === 1 ? 'lançamento' : 'lançamentos'}
            </p>
          </div>
        </div>
      </div>

      <div className="artist-toolbar">
        <a className="artist-main-action" href="#artist-discography">
          <span aria-hidden="true">▶</span>
          Ver discografia
        </a>
        <nav className="artist-page-tabs" aria-label="Seções do artista">
          <a href="#artist-discography">Lançamentos</a>
          <a href="#artist-about">Sobre</a>
        </nav>
        {user?.role === 'ADMIN' && (
          <Link to={`/admin?editArtist=${artistData.artist.id}`} className="secondary-btn compact-btn edit-release-action">
            Editar perfil
          </Link>
        )}
      </div>

      <section className="artist-discography" id="artist-discography">
        <div className="artist-section-heading">
          <p className="eyebrow">Conheça a discografia</p>
          <h2>Lançamentos populares</h2>
        </div>
        <div className="artist-release-list">
          {artistData.releases.length ? artistData.releases.map((release, index) => (
            <Link key={release.id} to={`/releases/${release.id}`} className="artist-release-row">
              <span className="artist-release-rank">{index + 1}</span>
              <img src={release.cover_url || getReleaseFallbackImage(release)} onError={(event) => handleImageError(event, getReleaseFallbackImage(release))} alt="" />
              <span className="artist-release-copy">
                <strong>{release.title}</strong>
                <small>{release.release_type} <span aria-hidden="true">•</span> {release.release_date}</small>
              </span>
              <span className="artist-release-open">Abrir lançamento <span aria-hidden="true">↗</span></span>
            </Link>
          )) : (
            <p className="artist-empty-state">Este artista ainda não tem lançamentos cadastrados.</p>
          )}
        </div>
      </section>

      <section className="artist-about" id="artist-about">
        <p className="eyebrow">Sobre</p>
        <h2>{artistData.artist.name}</h2>
        <p>{artistData.artist.bio || 'Biografia ainda não cadastrada.'}</p>
      </section>
    </div>
  );
}

function ReleaseCard({ release, showListen = false }) {
  return (
    <Link to={`/releases/${release.id}`} className="release-card glass-panel">
      <img src={release.cover_url || getReleaseFallbackImage(release)} onError={(event) => handleImageError(event, getReleaseFallbackImage(release))} alt={release.title} />
      <div className="release-meta">
        <span>{release.release_type}</span>
        <h3>{release.title}</h3>
        <p>{release.artist_name || 'Artista'}</p>
        <small>{release.release_date}</small>
        {showListen && <span className="listen-album-btn"><span aria-hidden="true">▶</span> Ouvir álbum</span>}
      </div>
    </Link>
  );
}

function ArtistCard({ artist }) {
  const releaseCount = Number(artist.release_count || 0);

  return (
    <Link to={`/artists/${artist.id}`} className="artist-card">
      <img src={artist.image_url || getArtistFallbackImage(artist)} onError={(event) => handleImageError(event, getArtistFallbackImage(artist))} alt={artist.name} />
      <div>
        <h3>{artist.name}</h3>
        <p>{artist.genre_names || artist.genre || 'Artista independente'}</p>
        <small>{releaseCount} {releaseCount === 1 ? 'lançamento' : 'lançamentos'}</small>
      </div>
    </Link>
  );
}

function ReleaseDetailPage() {
  const { releaseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [releaseInfo, setReleaseInfo] = useState(null);
  const [reviewText, setReviewText] = useState('');
  const [reviewGifUrl, setReviewGifUrl] = useState('');
  const [rating, setRating] = useState(8);
  const [message, setMessage] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeletingRelease, setIsDeletingRelease] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isUploadingReviewGif, setIsUploadingReviewGif] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [preSaved, setPreSaved] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [favoriteTrackIds, setFavoriteTrackIds] = useState([]);
  const [openLyricsTrackId, setOpenLyricsTrackId] = useState(null);
  const [lyricsDisplayMode, setLyricsDisplayMode] = useState('lyrics');
  const releaseCoverUrl = releaseInfo?.release
    ? releaseInfo.release.cover_url || getReleaseFallbackImage(releaseInfo.release)
    : '';

  const load = async () => {
    const releaseRes = await api.get(`/releases/${releaseId}`);
    setReleaseInfo(releaseRes.data);

    if (user) {
      const [playlistsRes, profileRes, preSaveRes] = await Promise.all([
        api.get('/playlists').catch(() => ({ data: [] })),
        api.get(`/profile/${user.id}`).catch(() => ({ data: { favorites: [] } })),
        api.get(`/pre-saves/${releaseId}`).catch(() => ({ data: { saved: false } })),
      ]);

      setPlaylists(playlistsRes.data || []);
      setSelectedPlaylistId((playlistsRes.data || [])[0]?.id || '');
      setFavoriteTrackIds((profileRes.data?.favorites || []).map((item) => item.track_id));
      setPreSaved(Boolean(preSaveRes.data?.saved));
    }
  };

  useEffect(() => {
    load();
  }, [releaseId, user]);

  useEffect(() => {
    setOpenLyricsTrackId(null);
    setLyricsDisplayMode('lyrics');
  }, [releaseId]);

  useEffect(() => {
    if (!openLyricsTrackId) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpenLyricsTrackId(null);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [openLyricsTrackId]);

  const togglePreSave = async () => {
    if (!user) return;
    const res = await api.post(`/pre-saves/${releaseId}`);
    setPreSaved(Boolean(res.data.saved));
  };

  const toggleFavoriteTrack = async (trackId) => {
    if (!user) return;
    const res = await api.post(`/favorites/${trackId}`);
    setFavoriteTrackIds((prev) => (res.data.favorite ? [...new Set([...prev, trackId])] : prev.filter((id) => id !== trackId)));
  };

  const addTrackToPlaylist = async (trackId) => {
    if (!user) return;
    if (!selectedPlaylistId) {
      alert('Crie uma playlist no seu perfil primeiro.');
      return;
    }

    const res = await api.post(`/playlists/${selectedPlaylistId}/tracks`, { track_id: trackId });
    if (res.data.added) {
      alert('Música adicionada à playlist.');
    } else {
      alert('Essa música já está na playlist.');
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    setIsSubmittingReview(true);
    setMessage('');
    try {
      await api.post('/reviews', {
        release_id: Number(releaseId),
        rating,
        review_text: reviewText,
        gif_url: reviewGifUrl,
      });
      setMessage('Avaliação publicada com sucesso.');
      setReviewText('');
      setReviewGifUrl('');
      setIsReviewModalOpen(false);
      await load();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Não foi possível publicar a avaliação.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const uploadReviewGif = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.type !== 'image/gif') {
      setMessage('Selecione um arquivo GIF válido.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage('O GIF deve ter no máximo 10 MB.');
      return;
    }

    setMessage('');
    setIsUploadingReviewGif(true);
    try {
      setReviewGifUrl(await uploadImage(file));
    } catch (error) {
      setMessage(error.response?.data?.error || 'Não foi possível enviar o GIF.');
    } finally {
      setIsUploadingReviewGif(false);
    }
  };

  const handleReviewLikeChange = (reviewId, liked, likeCount) => {
    setReleaseInfo((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        reviews: prev.reviews.map((review) => {
          if (review.id !== reviewId) return review;
          return {
            ...review,
            like_count: likeCount,
            liked_by_user: liked,
          };
        }),
      };
    });
  };

  if (!releaseInfo) return <div className="loading-panel">Carregando lançamento…</div>;

  const { release, tracks, reviews } = releaseInfo;
  const selectedLyricsTrack = tracks.find((track) => track.id === openLyricsTrackId);
  const isFutureRelease = new Date(release.release_date) > new Date();
  const formattedReleaseDate = release.release_date ? new Date(release.release_date + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }) : 'Data indisponível';

  const deleteRelease = async () => {
    const confirmed = window.confirm(
      `Excluir "${release.title}"? As faixas, avaliações, curtidas, favoritos e vínculos em playlists também serão removidos. Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setDeleteError('');
    setIsDeletingRelease(true);
    try {
      await api.delete(`/releases/${release.id}`);
      navigate('/admin', { replace: true });
    } catch (error) {
      setDeleteError(error.response?.data?.error || 'Não foi possível excluir o lançamento. Tente novamente.');
    } finally {
      setIsDeletingRelease(false);
    }
  };

  return (
    <div className="content-stack release-view">
      <div className="release-detail glass-panel">
        <ArtworkBackdrop src={releaseCoverUrl} className="release-artwork-backdrop" />
        <img src={releaseCoverUrl} onError={(event) => handleImageError(event, getReleaseFallbackImage(release))} alt={release.title} />
        <div className="release-copy-wrap">
          <p className="eyebrow">{release.release_type}</p>
          <h1>{release.title}</h1>
          <Link to={`/artists/${release.artist_id}`} className="release-artist-link">
            {release.artist_name}
          </Link>

          <div className="stats-row">
            <div className="stat-pill">
              <span className="stat-label">Lançamento</span>
              <strong>{formattedReleaseDate}</strong>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Média</span>
              <strong>{Number(release.avg_rating || 0).toFixed(1)}</strong>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Avaliações</span>
              <strong>{release.review_count || 0}</strong>
            </div>
          </div>

          <p className="release-description">
            {release.description || 'A biografia deste álbum ainda não foi cadastrada.'}
          </p>

          <div className="action-row">
            {user && (
              <button className="primary-btn" onClick={togglePreSave} type="button">
                {preSaved ? 'Remover pré-save' : isFutureRelease ? 'Pré-salvar lançamento' : 'Salvar lançamento'}
              </button>
            )}
            {user && (
              <button className="secondary-btn" onClick={() => {
                setMessage('');
                setIsReviewModalOpen(true);
              }} type="button">
                Avaliar
              </button>
            )}
            {user?.role === 'ADMIN' && (
              <Link to={`/admin?editRelease=${release.id}`} className="secondary-btn edit-release-action">
                Editar álbum
              </Link>
            )}
            {user?.role === 'ADMIN' && (
              <button
                type="button"
                className="danger-btn compact-btn"
                onClick={deleteRelease}
                disabled={isDeletingRelease}
                aria-label={`Excluir ${release.title}`}
              >
                {isDeletingRelease ? 'Excluindo…' : 'Excluir lançamento'}
              </button>
            )}
          </div>
          {deleteError && <p className="error-text" role="alert">{deleteError}</p>}
        </div>
      </div>

      <section className="subsection album-tracklist-panel">
        <div className="section-heading-row">
          <h3>Lista de faixas</h3>
          <span>{tracks.length} faixas</span>
        </div>
        <div className="tracklist">
          {tracks.map((track) => {
            const isLyricsOpen = openLyricsTrackId === track.id;
            return (
              <div key={track.id} className={`track-item glass-panel ${isLyricsOpen ? 'is-open' : ''}`}>
                <div className="track-row-main">
                  <span className="track-number">{track.track_number}</span>
                  <div className="track-main">
                    <div className="track-text-block">
                      <strong>{track.title}</strong>
                      <small>{track.duration}</small>
                    </div>
                    {Boolean(track.explicit) && (
                      <span className="explicit-tag" aria-label="Conteúdo explícito" title="Conteúdo explícito">
                        E
                      </span>
                    )}
                  </div>
                  <div className="track-actions">
                    {track.youtube_url && (
                      <a href={track.youtube_url} target="_blank" rel="noreferrer" className="track-link-btn">
                        Ouvir
                      </a>
                    )}
                    {(track.lyrics || track.translation) && (
                      <button
                        type="button"
                        className="ghost-btn track-compact-btn"
                        aria-expanded={isLyricsOpen}
                        onClick={() => {
                          if (isLyricsOpen) {
                            setOpenLyricsTrackId(null);
                          } else {
                            setLyricsDisplayMode(track.lyrics ? 'lyrics' : 'translation');
                            setOpenLyricsTrackId(track.id);
                          }
                        }}
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 4.5h10M5 8h10M5 11.5h7M5 15h5" />
                          <path d="M3 2.5h14v15H3z" />
                        </svg>
                        {isLyricsOpen ? 'Ocultar letra' : 'Ver letra'}
                      </button>
                    )}
                    {user && (
                      <button
                        type="button"
                        className={`ghost-btn track-like-btn${favoriteTrackIds.includes(track.id) ? ' is-favorite' : ''}`}
                        aria-label={favoriteTrackIds.includes(track.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        aria-pressed={favoriteTrackIds.includes(track.id)}
                        onClick={() => toggleFavoriteTrack(track.id)}
                      >
                        {favoriteTrackIds.includes(track.id) ? '♥' : '♡'}
                      </button>
                    )}
                    {user && (
                      <button type="button" className="ghost-btn track-compact-btn playlist-btn" onClick={() => addTrackToPlaylist(track.id)}>
                        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3.5 5h8M3.5 9h8M3.5 13h5" />
                          <path d="M15 10v7m-3.5-3.5h7" />
                        </svg>
                        Playlist
                      </button>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </section>

      {selectedLyricsTrack && (
        <div
          className="lyrics-viewer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpenLyricsTrackId(null);
          }}
        >
          <section className="lyrics-viewer" role="dialog" aria-modal="true" aria-labelledby="lyrics-viewer-title">
            <button type="button" className="lyrics-viewer-close" onClick={() => setOpenLyricsTrackId(null)} aria-label="Fechar visualização da letra" autoFocus>
              <span aria-hidden="true">×</span>
            </button>

            <aside className="lyrics-viewer-aside">
              <img src={release.cover_url || getReleaseFallbackImage(release)} onError={(event) => handleImageError(event, getReleaseFallbackImage(release))} alt={`Capa de ${release.title}`} />
              <div className="lyrics-viewer-track-info">
                <p className="lyrics-viewer-eyebrow">FAIXA {selectedLyricsTrack.track_number} · {selectedLyricsTrack.duration}</p>
                <h2>{selectedLyricsTrack.title}</h2>
                <Link to={`/artists/${release.artist_id}`} onClick={() => setOpenLyricsTrackId(null)}>
                  {release.artist_name}
                </Link>
                <span>{release.title}</span>
              </div>
              {selectedLyricsTrack.youtube_url && (
                <a className="lyrics-viewer-listen" href={selectedLyricsTrack.youtube_url} target="_blank" rel="noreferrer">
                  Ouvir faixa <span aria-hidden="true">↗</span>
                </a>
              )}
            </aside>

            <div className="lyrics-viewer-content">
              <header className="lyrics-viewer-header">
                <div>
                  <p className="lyrics-viewer-eyebrow">LETRA DA MÚSICA</p>
                  <h1 id="lyrics-viewer-title">{selectedLyricsTrack.title}</h1>
                </div>
                <div className="lyrics-viewer-modes" role="group" aria-label="Exibição da letra">
                  <button
                    type="button"
                    className={lyricsDisplayMode === 'lyrics' ? 'is-active' : ''}
                    aria-pressed={lyricsDisplayMode === 'lyrics'}
                    disabled={!selectedLyricsTrack.lyrics}
                    onClick={() => setLyricsDisplayMode('lyrics')}
                  >
                    Letra
                  </button>
                  <button
                    type="button"
                    className={lyricsDisplayMode === 'translation' ? 'is-active' : ''}
                    aria-pressed={lyricsDisplayMode === 'translation'}
                    disabled={!selectedLyricsTrack.translation}
                    onClick={() => setLyricsDisplayMode('translation')}
                  >
                    Tradução
                  </button>
                  <button
                    type="button"
                    className={lyricsDisplayMode === 'both' ? 'is-active' : ''}
                    aria-pressed={lyricsDisplayMode === 'both'}
                    disabled={!selectedLyricsTrack.lyrics || !selectedLyricsTrack.translation}
                    onClick={() => setLyricsDisplayMode('both')}
                  >
                    Ambas
                  </button>
                </div>
              </header>

              <div className={`lyrics-viewer-scroll mode-${lyricsDisplayMode}`}>
                {(lyricsDisplayMode === 'lyrics' || lyricsDisplayMode === 'both') && (
                  <section className="lyrics-column">
                    {lyricsDisplayMode === 'both' && <h3>Letra original</h3>}
                    <p>{selectedLyricsTrack.lyrics || 'A letra original ainda não foi cadastrada.'}</p>
                  </section>
                )}
                {(lyricsDisplayMode === 'translation' || lyricsDisplayMode === 'both') && (
                  <section className="lyrics-column">
                    {lyricsDisplayMode === 'both' && <h3>Tradução</h3>}
                    <p>{selectedLyricsTrack.translation || 'A tradução ainda não foi cadastrada.'}</p>
                  </section>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {isReviewModalOpen && (
        <div className="modal-backdrop review-backdrop" onClick={() => !isSubmittingReview && setIsReviewModalOpen(false)}>
          <div
            className="review-modal glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="review-modal-header">
              <div>
                <p className="eyebrow">Sua opinião importa</p>
                <h2 id="review-modal-title">Avaliar lançamento</h2>
              </div>
              <button
                type="button"
                className="close-btn review-close-btn"
                aria-label="Fechar avaliação"
                disabled={isSubmittingReview || isUploadingReviewGif}
                onClick={() => setIsReviewModalOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={submitReview} className="review-form">
              <div className="review-album-summary">
                <img
                  src={release.cover_url || 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80'}
                  alt=""
                />
                <div>
                  <span>{release.release_type}</span>
                  <strong>{release.title}</strong>
                  <small>{release.artist_name}</small>
                </div>
              </div>

              <section className="review-rating-section" aria-labelledby="review-rating-label">
                <div className="review-rating-heading">
                  <div>
                    <h3 id="review-rating-label">Que nota você daria?</h3>
                    <p>Arraste para escolher uma nota de 0 a 10</p>
                  </div>
                  <div className="review-score" aria-live="polite">
                    <strong>{rating}</strong>
                    <span>/10</span>
                  </div>
                </div>
                <input
                  className="review-rating-slider"
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={rating}
                  aria-label={`Nota: ${rating} de 10`}
                  onChange={(e) => setRating(Number(e.target.value))}
                />
                <div className="review-rating-scale" aria-hidden="true">
                  <span>Não gostei</span>
                  <span>Adorei</span>
                </div>
              </section>

              <label className="review-text-label" htmlFor="review-text">
                <span>Conte o que achou <small>opcional</small></span>
                <textarea
                  id="review-text"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="O que mais chamou sua atenção neste lançamento?"
                  rows="5"
                  maxLength={300}
                  disabled={isSubmittingReview || isUploadingReviewGif}
                />
                <small className="review-character-count" aria-live="polite">
                  {reviewText.length}/300 caracteres
                </small>
              </label>

              <div className="review-gif-picker">
                <label htmlFor="review-gif-upload">
                  <span aria-hidden="true">▧</span>
                  {isUploadingReviewGif ? 'Enviando GIF…' : reviewGifUrl ? 'Trocar GIF' : 'Adicionar GIF'}
                </label>
                <input
                  id="review-gif-upload"
                  type="file"
                  accept="image/gif,.gif"
                  onChange={uploadReviewGif}
                  disabled={isSubmittingReview || isUploadingReviewGif}
                />
                {reviewGifUrl && (
                  <div className="review-gif-preview">
                    <ReviewGif src={reviewGifUrl} />
                    <button type="button" className="ghost-btn compact-btn" onClick={() => setReviewGifUrl('')}>
                      Remover GIF
                    </button>
                  </div>
                )}
              </div>

              {message && <p className="review-error" role="alert">{message}</p>}

              <div className="review-modal-actions">
                <button
                  className="secondary-btn"
                  type="button"
                  disabled={isSubmittingReview || isUploadingReviewGif}
                  onClick={() => setIsReviewModalOpen(false)}
                >
                  Cancelar
                </button>
                <button className="primary-btn" type="submit" disabled={isSubmittingReview || isUploadingReviewGif}>
                  {isSubmittingReview ? 'Publicando...' : isUploadingReviewGif ? 'Enviando GIF…' : 'Publicar avaliação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="subsection">
        <h3>Notas sociais</h3>
        <div className="feed-list">
          {reviews.map((review) => (
            <div key={review.id} className="review-feed-item glass-panel">
              <div className="review-head">
                <Link to={`/profile/${review.user_id}`} className="mini-user review-author-link">
                  <img src={review.avatar_url || imagePlaceholder} onError={(event) => handleImageError(event, imagePlaceholder)} alt={review.username} />
                  <div>
                    <strong>{review.username}</strong>
                    <span>{review.created_at}</span>
                  </div>
                </Link>
                <RatingBadge value={review.rating} />
              </div>
              <p>{review.review_text}</p>
              {review.gif_url && <ReviewGif src={review.gif_url} />}
              <div className="review-actions">
                <ReviewLikeButton
                  review={review}
                  user={user}
                  onChange={(liked, likeCount) => handleReviewLikeChange(review.id, liked, likeCount)}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProfilePage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [profileImageUploads, setProfileImageUploads] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [form, setForm] = useState({ username: '', full_name: '', bio: '', avatar_url: '', banner_url: '' });
  const [playlistName, setPlaylistName] = useState('');
  const [playlistError, setPlaylistError] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [socialListMode, setSocialListMode] = useState('');
  const [socialUsers, setSocialUsers] = useState([]);
  const [socialListError, setSocialListError] = useState('');
  const [isLoadingSocialUsers, setIsLoadingSocialUsers] = useState(false);

  const loadProfile = async () => {
    const target = userId || user?.id;
    if (!target) return;
    const res = await api.get(`/profile/${target}`);
    setProfile(res.data);
    setForm({
      username: res.data.user.username,
      full_name: res.data.user.full_name,
      bio: res.data.user.bio || '',
      avatar_url: res.data.user.avatar_url || '',
      banner_url: res.data.user.banner_url || '',
    });
  };

  useEffect(() => {
    loadProfile();
  }, [userId, user]);

  const saveProfile = async () => {
    await api.put('/users/me', form);
    await loadProfile();
    setIsEditing(false);
  };

  const createPlaylist = async () => {
    const name = playlistName.trim();
    if (!name) {
      setPlaylistError('Dê um nome para sua playlist.');
      return;
    }

    setPlaylistError('');
    setIsCreatingPlaylist(true);
    try {
      await api.post('/playlists', { name, description: 'Playlist criada no Musicfy.' });
      setPlaylistName('');
      await loadProfile();
    } catch (error) {
      setPlaylistError(error.response?.data?.error || 'Não foi possível criar a playlist. Tente novamente.');
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  const toggleSocialList = async (mode) => {
    if (socialListMode === mode) {
      setSocialListMode('');
      return;
    }

    setSocialListMode(mode);
    setSocialUsers([]);
    setSocialListError('');
    setIsLoadingSocialUsers(true);
    try {
      const response = await api.get(`/users/${userId || user?.id}/${mode}`);
      setSocialUsers(response.data || []);
    } catch (error) {
      setSocialListError(error.response?.data?.error || 'Não foi possível carregar esta lista.');
    } finally {
      setIsLoadingSocialUsers(false);
    }
  };

  const handleProfileFollowChange = (isFollowing) => {
    setProfile((current) => current ? ({
      ...current,
      social: {
        ...current.social,
        followers: Math.max(0, Number(current.social?.followers || 0) + (isFollowing ? 1 : -1)),
        is_following: isFollowing,
      },
    }) : current);
  };

  if (!profile) return <div className="loading-panel">Carregando perfil…</div>;

  const isOwner = Number(user?.id) === Number(profile.user.id);

  return (
    <div className="content-stack profile-page">
      <div className="profile-hero glass-panel" style={{ backgroundImage: `url(${profile.user.banner_url || 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80'})` }}>
        <div className="profile-copy">
          <img src={profile.user.avatar_url || imagePlaceholder} onError={(event) => handleImageError(event, imagePlaceholder)} alt={profile.user.username} />
          <div>
            <h1>{profile.user.full_name}</h1>
            <p>@{profile.user.username}</p>
            {profile.user.bio && <span>{profile.user.bio}</span>}
          </div>
        </div>
      </div>

      <div className="profile-social-strip">
        <div className="profile-social-counts">
          <button type="button" onClick={() => void toggleSocialList('followers')}>
            <strong>{Number(profile.social?.followers || 0)}</strong><span>Seguidores</span>
          </button>
          <button type="button" onClick={() => void toggleSocialList('following')}>
            <strong>{Number(profile.social?.following || 0)}</strong><span>Seguindo</span>
          </button>
        </div>
        {!isOwner && (
          <FollowButton
            userId={profile.user.id}
            initialFollowing={Boolean(profile.social?.is_following)}
            onChange={handleProfileFollowChange}
          />
        )}
      </div>

      {socialListMode && (
        <section className="profile-social-list glass-panel">
          <div className="profile-social-list-heading">
            <div>
              <p className="eyebrow">Conexões</p>
              <h2>{socialListMode === 'followers' ? 'Seguidores' : 'Seguindo'}</h2>
            </div>
            <button type="button" className="secondary-btn compact-btn" onClick={() => setSocialListMode('')}>Fechar</button>
          </div>
          {isLoadingSocialUsers ? (
            <p className="profile-social-list-message">Carregando pessoas…</p>
          ) : socialListError ? (
            <p className="error-text" role="alert">{socialListError}</p>
          ) : socialUsers.length ? (
            <div className="profile-social-user-list">
              {socialUsers.map((person) => (
                <article key={person.id} className="profile-social-user">
                  <Link to={`/profile/${person.id}`} className="social-user-link">
                    <img src={person.avatar_url || imagePlaceholder} onError={(event) => handleImageError(event, imagePlaceholder)} alt="" />
                    <span className="social-user-copy">
                      <strong>{person.full_name || person.username}</strong>
                      <small>@{person.username}</small>
                    </span>
                  </Link>
                  <FollowButton userId={person.id} initialFollowing={Boolean(person.followed_by_user)} />
                </article>
              ))}
            </div>
          ) : (
            <p className="profile-social-list-message">Ainda não há pessoas nesta lista.</p>
          )}
        </section>
      )}

      <div className="profile-toolbar">
        <div className="profile-tabs" role="tablist" aria-label="Seções do perfil">
          <button type="button" role="tab" aria-selected={activeTab === 'overview'} className={activeTab === 'overview' ? 'is-active' : ''} onClick={() => setActiveTab('overview')}>Visão geral</button>
          <button type="button" role="tab" aria-selected={activeTab === 'reviews'} className={activeTab === 'reviews' ? 'is-active' : ''} onClick={() => setActiveTab('reviews')}>Avaliações</button>
          <button type="button" role="tab" aria-selected={activeTab === 'playlists'} className={activeTab === 'playlists' ? 'is-active' : ''} onClick={() => setActiveTab('playlists')}>Playlists</button>
          <button type="button" role="tab" aria-selected={activeTab === 'favorites'} className={activeTab === 'favorites' ? 'is-active' : ''} onClick={() => setActiveTab('favorites')}>Curtidas</button>
        </div>
        {isOwner && (
          <button type="button" className="secondary-btn" onClick={() => setIsEditing((value) => !value)}>
            {isEditing ? 'Cancelar' : 'Editar perfil'}
          </button>
        )}
      </div>

      {isEditing && (
        <div className="profile-edit glass-panel">
          <h3>Editar perfil</h3>
          <div className="form-grid">
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nome completo" />
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Nome de usuário" />
            <div className="upload-grid">
              <ImageUploadField
                label="Foto do perfil"
                value={form.avatar_url}
                onChange={(value) => setForm({ ...form, avatar_url: value })}
                placeholder="URL da foto de perfil"
                onImageUpload={uploadImage}
                onUploadStateChange={(uploading) => setProfileImageUploads((count) => count + (uploading ? 1 : -1))}
              />
              <ImageUploadField
                label="Banner do perfil"
                value={form.banner_url}
                onChange={(value) => setForm({ ...form, banner_url: value })}
                placeholder="URL do banner do perfil"
                onImageUpload={uploadImage}
                onUploadStateChange={(uploading) => setProfileImageUploads((count) => count + (uploading ? 1 : -1))}
              />
            </div>
            <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Biografia" rows="4" />
          </div>
          <button type="button" className="primary-btn" disabled={profileImageUploads > 0} onClick={saveProfile}>Salvar alterações</button>
        </div>
      )}

      {activeTab === 'overview' && (
        <section className="profile-overview">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">Seu espaço Musicfy</p>
              <h2>Visão geral</h2>
              <p>Acompanhe sua atividade e volte ao que você curte.</p>
            </div>
          </div>

          <div className="profile-stat-grid">
            <button type="button" className="profile-stat-card" onClick={() => setActiveTab('reviews')}>
              <span className="profile-stat-icon" aria-hidden="true">✦</span>
              <strong>{profile.reviews.length}</strong>
              <span>Avaliações</span>
            </button>
            <button type="button" className="profile-stat-card" onClick={() => setActiveTab('playlists')}>
              <span className="profile-stat-icon" aria-hidden="true">♫</span>
              <strong>{profile.playlists.length}</strong>
              <span>Playlists</span>
            </button>
            <button type="button" className="profile-stat-card" onClick={() => setActiveTab('favorites')}>
              <span className="profile-stat-icon" aria-hidden="true">♥</span>
              <strong>{profile.favorites.length}</strong>
              <span>Músicas curtidas</span>
            </button>
          </div>

          <article className="profile-bio-card glass-panel">
            <div className="profile-bio-mark" aria-hidden="true">“</div>
            <div>
              <p className="eyebrow">Um pouco sobre</p>
              <h3>{profile.user.full_name}</h3>
              <p>{profile.user.bio || (isOwner ? 'Adicione uma biografia para contar um pouco sobre você e seus gostos musicais.' : 'Este usuário ainda não adicionou uma biografia.')}</p>
            </div>
          </article>
        </section>
      )}

      {activeTab === 'reviews' && (
        <section className="profile-section">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">Opiniões e descobertas</p>
              <h2>Avaliações</h2>
              <p>{profile.reviews.length} {profile.reviews.length === 1 ? 'lançamento avaliado' : 'lançamentos avaliados'}</p>
            </div>
          </div>
          {profile.reviews.length ? (
            <div className="profile-review-list">
              {profile.reviews.map((review) => (
                <article key={review.id} className="profile-review-card glass-panel">
                  <Link to={`/releases/${review.release_id}`} className="profile-review-artwork" aria-label={`Abrir ${review.release_title}`}>
                    <img src={review.release_cover || imagePlaceholder} onError={(event) => handleImageError(event, imagePlaceholder)} alt="" />
                  </Link>
                  <div className="profile-review-copy">
                    <div className="profile-review-heading">
                      <div>
                        <span className="eyebrow">{review.artist_name || 'Lançamento'}</span>
                        <Link to={`/releases/${review.release_id}`} className="profile-review-title">{review.release_title}</Link>
                      </div>
                      <RatingBadge value={review.rating} />
                    </div>
                    <p>{review.review_text || 'Sem comentário escrito.'}</p>
                    {review.gif_url && <ReviewGif src={review.gif_url} />}
                    <small>{review.created_at}</small>
                    <ReviewLikeButton review={review} user={user} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="profile-empty-state glass-panel">
              <span aria-hidden="true">✦</span>
              <h3>Suas avaliações aparecem aqui</h3>
              <p>Avalie um álbum ou EP para compartilhar sua opinião com outras pessoas.</p>
              <Link to="/explore" className="secondary-btn">Explorar lançamentos</Link>
            </div>
          )}
        </section>
      )}

      {activeTab === 'playlists' && (
        <section className="profile-section">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">Trilhas para cada momento</p>
              <h2>Playlists</h2>
              <p>{profile.playlists.length} {profile.playlists.length === 1 ? 'playlist criada' : 'playlists criadas'}</p>
            </div>
          </div>

          {isOwner && (
            <form className="playlist-create-panel glass-panel" onSubmit={(event) => {
              event.preventDefault();
              void createPlaylist();
            }}>
              <div className="playlist-create-art" aria-hidden="true">♫</div>
              <div className="playlist-create-copy">
                <p className="eyebrow">Nova coleção</p>
                <h3>Crie a trilha do seu próximo momento</h3>
                <p>Dê um nome à playlist. Depois, você poderá adicionar suas músicas favoritas.</p>
                <div className="playlist-create-form">
                  <input
                    value={playlistName}
                    maxLength={191}
                    onChange={(event) => {
                      setPlaylistName(event.target.value);
                      setPlaylistError('');
                    }}
                    placeholder="Ex.: Noites tranquilas"
                    aria-label="Nome da playlist"
                    required
                    disabled={isCreatingPlaylist}
                  />
                  <button type="submit" className="primary-btn" disabled={isCreatingPlaylist}>
                    {isCreatingPlaylist ? 'Criando...' : 'Criar playlist'}
                  </button>
                </div>
                {playlistError && <p className="playlist-form-error" role="alert">{playlistError}</p>}
              </div>
            </form>
          )}

          {profile.playlists.length ? (
            <div className="profile-playlist-grid">
              {profile.playlists.map((playlist) => (
                <article key={playlist.id} className="profile-playlist-card glass-panel">
                  <div className="profile-playlist-artwork">
                    <img src={playlist.cover_url || imagePlaceholder} onError={(event) => handleImageError(event, imagePlaceholder)} alt="" />
                    <span aria-hidden="true">♫</span>
                  </div>
                  <div className="profile-playlist-copy">
                    <h3>{playlist.name}</h3>
                    <p>{playlist.description || 'Uma seleção pessoal de músicas.'}</p>
                    <small>{Number(playlist.track_count || 0)} {Number(playlist.track_count || 0) === 1 ? 'música' : 'músicas'}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="profile-empty-state glass-panel">
              <span aria-hidden="true">♫</span>
              <h3>Nenhuma playlist por enquanto</h3>
              <p>{isOwner ? 'Crie uma playlist para organizar as músicas que combinam com você.' : 'Este usuário ainda não criou playlists.'}</p>
            </div>
          )}
        </section>
      )}

      {activeTab === 'favorites' && (
        <section className="profile-section">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">Músicas que ficam com você</p>
              <h2>Curtidas</h2>
              <p>{profile.favorites.length} {profile.favorites.length === 1 ? 'música salva' : 'músicas salvas'}</p>
            </div>
          </div>
          {profile.favorites.length ? (
            <div className="profile-favorite-grid">
              {profile.favorites.map((favorite) => (
                <Link key={favorite.id} to={`/releases/${favorite.release_id}`} className="profile-favorite-card glass-panel">
                  <img src={favorite.release_cover || imagePlaceholder} onError={(event) => handleImageError(event, imagePlaceholder)} alt="" />
                  <div>
                    <span className="profile-favorite-heart" aria-hidden="true">♥</span>
                    <h3>{favorite.track_title}</h3>
                    <p>{favorite.artist_name}</p>
                    <small>{favorite.release_title}</small>
                  </div>
                  <span className="profile-favorite-open" aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="profile-empty-state glass-panel">
              <span aria-hidden="true">♥</span>
              <h3>Suas músicas curtidas aparecem aqui</h3>
              <p>Toque no coração em uma música para guardá-la nesta coleção.</p>
              <Link to="/explore" className="secondary-btn">Encontrar músicas</Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function AuthPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', full_name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const url = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login' ? { username: form.username, password: form.password } : { ...form };
      const res = await api.post(url, payload);
      login(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Falha na autenticação.');
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-box glass-panel">
        <div className="auth-toggle">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">Entrar</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} type="button">Cadastrar</button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <>
              <input placeholder="Nome completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <input type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </>
          )}

          <input placeholder="Nome de usuário" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input type="password" placeholder="Senha" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

          {mode === 'register' && (
            <input type="password" placeholder="Confirmar senha" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
          )}

          {error && <p className="error-text">{error}</p>}
          <button className="primary-btn" type="submit">{mode === 'login' ? 'Entrar no Musicfy' : 'Criar conta'}</button>
        </form>
      </div>
    </div>
  );
}

function ImageUploadField({ label, value, onChange, placeholder, hint, onImageUpload, onUploadStateChange }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleSelectedFile = async (file) => {
    if (!file) return;

    const supportedType = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type);
    const supportedExtension = /\.(jpe?g|png|gif|webp)$/i.test(file.name);
    if (!supportedType && !supportedExtension) {
      setUploadError('Selecione uma imagem JPG, PNG, GIF ou WebP.');
      return;
    }

    setUploadError('');
    setIsUploading(true);
    onUploadStateChange?.(true);
    try {
      onChange(await onImageUpload(file));
    } catch (error) {
      console.error('Image upload failed:', error);
      setUploadError(error.response?.data?.error || 'Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      setIsUploading(false);
      onUploadStateChange?.(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    void handleSelectedFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    void handleSelectedFile(file);
  };

  return (
    <div
      className={`image-upload-field glass-panel ${isDragging ? 'is-dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="image-upload-header">
        <span>{label}</span>
        <button type="button" className="secondary-btn compact-btn" disabled={isUploading} onClick={() => inputRef.current?.click()}>
          {isUploading ? 'Enviando...' : 'Carregar imagem'}
        </button>
      </div>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp" hidden onChange={handleFileChange} />
      <div className="image-preview">
        {value ? (
          <img src={value} alt={label} />
        ) : (
          <div className="image-empty-state">Sem imagem</div>
        )}
      </div>
      <div className="image-drop-hint">{hint || 'Arraste e solte ou use a URL abaixo'}</div>
      {uploadError && <p className="image-upload-error" role="alert">{uploadError}</p>}
      <input type="url" maxLength={512} value={value} placeholder={placeholder} disabled={isUploading} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AdminPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState({ artists: { count: 0 }, releases: { count: 0 }, users: { count: 0 }, reviews: { count: 0 } });
  const [artistList, setArtistList] = useState([]);
  const [releaseList, setReleaseList] = useState([]);
  const [artistImageUploads, setArtistImageUploads] = useState(0);
  const [isReleaseCoverUploading, setIsReleaseCoverUploading] = useState(false);
  const [editingArtistId, setEditingArtistId] = useState(null);
  const [editingReleaseId, setEditingReleaseId] = useState(null);
  const [adminError, setAdminError] = useState('');
  const [artistForm, setArtistForm] = useState({ name: '', bio: '', image_url: '', banner_url: '', genres: '' });
  const [releaseForm, setReleaseForm] = useState({
    title: '',
    artist_id: '',
    artist_name: '',
    cover_url: '',
    release_type: 'Album',
    release_date: '',
    genre: '',
    description: '',
    tracks: [{ title: '', duration: '3:00', explicit: false, youtube_url: '', lyrics: '', translation: '' }],
  });
  const [featuredForm, setFeaturedForm] = useState({ release_id: '', sort_order: 1 });

  const reportAdminError = (error, fallback) => {
    const message = error.response?.data?.error;
    setAdminError(typeof message === 'string' && message ? message : fallback);
  };

  const refreshCatalogLists = async () => {
    try {
      const [artistsRes, releasesRes] = await Promise.all([api.get('/artists'), api.get('/releases')]);
      setArtistList(artistsRes.data || []);
      setReleaseList(releasesRes.data || []);
    } catch (error) {
      console.error(error);
      reportAdminError(error, 'Não foi possível carregar o catálogo. Consulte os logs do servidor.');
    }
  };

  useEffect(() => {
    api.get('/dashboard')
      .then((res) => setStats(res.data))
      .catch((error) => reportAdminError(error, 'Não foi possível carregar o painel administrativo.'));
    refreshCatalogLists();
  }, [user]);

  const resetArtistForm = () => {
    setEditingArtistId(null);
    setArtistForm({ name: '', bio: '', image_url: '', banner_url: '', genres: '' });
  };

  const submitArtist = async (e) => {
    e.preventDefault();
    setAdminError('');
    const payload = {
      ...artistForm,
      genres: artistForm.genres.split(',').map((g) => g.trim()).filter(Boolean),
    };

    try {
      if (editingArtistId) {
        await api.put(`/artists/${editingArtistId}`, payload);
      } else {
        await api.post('/artists', payload);
      }

      alert(editingArtistId ? 'Artista atualizado com sucesso.' : 'Artista criado.');
      resetArtistForm();
      refreshCatalogLists();
    } catch (error) {
      reportAdminError(error, 'Não foi possível salvar o artista. Consulte os logs do servidor.');
    }
  };

  const updateTrack = (index, field, value) => {
    setReleaseForm((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track, trackIndex) => (trackIndex === index ? { ...track, [field]: value } : track)),
    }));
  };

  const addTrackRow = () => {
    setReleaseForm((prev) => ({
      ...prev,
      tracks: [...prev.tracks, { title: '', duration: '3:00', explicit: false, youtube_url: '', lyrics: '', translation: '' }],
    }));
  };

  const removeTrackRow = (index) => {
    setReleaseForm((prev) => ({
      ...prev,
      tracks: prev.tracks.filter((_, trackIndex) => trackIndex !== index),
    }));
  };

  const resetReleaseForm = () => {
    setEditingReleaseId(null);
    setReleaseForm({
      title: '',
      artist_id: '',
      artist_name: '',
      cover_url: '',
      release_type: 'Album',
      release_date: '',
      genre: '',
      description: '',
      tracks: [{ title: '', duration: '3:00', explicit: false, youtube_url: '', lyrics: '', translation: '' }],
    });
  };

  const submitRelease = async (e) => {
    e.preventDefault();
    setAdminError('');

    const validTracks = releaseForm.tracks
      .filter((track) => track.title || track.youtube_url || track.lyrics || track.translation)
      .map((track, index) => ({
        title: track.title || `Faixa ${index + 1}`,
        duration: track.duration || '3:00',
        explicit: Boolean(track.explicit),
        youtube_url: track.youtube_url || '',
        lyrics: track.lyrics || '',
        translation: track.translation || '',
      }));

    const payload = {
      ...releaseForm,
      artist_id: releaseForm.artist_id ? Number(releaseForm.artist_id) : undefined,
      artist_name: releaseForm.artist_name || undefined,
      tracks: validTracks,
    };
    try {
      if (editingReleaseId) {
        await api.put(`/releases/${editingReleaseId}`, payload);
      } else {
        await api.post('/releases', payload);
      }

      alert(editingReleaseId ? 'Álbum atualizado com sucesso.' : 'Lançamento criado.');
      resetReleaseForm();
      refreshCatalogLists();
    } catch (error) {
      reportAdminError(error, 'Não foi possível salvar o lançamento. Confira a data e o artista.');
    }
  };

  const resetCatalog = async () => {
    const confirmed = window.confirm('Deseja zerar todos os artistas e lançamentos da plataforma? Esta ação não remove usuários.');
    if (!confirmed) return;

    setAdminError('');
    try {
      await api.post('/admin/reset-catalog');
      alert('Catálogo zerado. Você pode criar novos artistas e álbuns agora.');
      api.get('/dashboard').then((res) => setStats(res.data)).catch(console.error);
      refreshCatalogLists();
    } catch (error) {
      reportAdminError(error, 'Não foi possível zerar o catálogo. Consulte os logs do servidor.');
    }
  };

  const submitFeatured = async (e) => {
    e.preventDefault();
    setAdminError('');
    try {
      await api.post('/admin/featured', {
        release_id: Number(featuredForm.release_id),
        sort_order: Number(featuredForm.sort_order),
      });
      alert('Destaque atualizado no carrossel inicial.');
      setFeaturedForm({ release_id: '', sort_order: 1 });
      refreshCatalogLists();
    } catch (error) {
      reportAdminError(error, 'Não foi possível salvar o destaque. Confira o lançamento selecionado.');
    }
  };

  const handleArtistEdit = (artist) => {
    setEditingArtistId(artist.id);
    setArtistForm({
      name: artist.name || '',
      bio: artist.bio || '',
      image_url: artist.image_url || '',
      banner_url: artist.banner_url || '',
      genres: artist.genre_names || artist.genre || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleArtistDelete = async (artistId) => {
    if (!window.confirm('Deseja excluir este artista e seus lançamentos?')) return;
    setAdminError('');
    try {
      await api.delete(`/artists/${artistId}`);
      alert('Artista removido.');
      if (editingArtistId === artistId) resetArtistForm();
      refreshCatalogLists();
      api.get('/dashboard').then((res) => setStats(res.data)).catch(console.error);
    } catch (error) {
      reportAdminError(error, 'Não foi possível excluir o artista. Consulte os logs do servidor.');
    }
  };

  const handleReleaseEdit = async (release) => {
    const detail = await api.get(`/releases/${release.id}`);
    const tracks = detail.data.tracks?.map((track) => ({
      id: track.id,
      title: track.title || '',
      duration: track.duration || '3:00',
      explicit: Boolean(track.explicit),
      youtube_url: track.youtube_url || '',
      lyrics: track.lyrics || '',
      translation: track.translation || '',
    })) || [{ title: '', duration: '3:00', explicit: false, youtube_url: '', lyrics: '', translation: '' }];

    setReleaseForm({
      title: detail.data.release.title || '',
      artist_id: detail.data.release.artist_id ? String(detail.data.release.artist_id) : '',
      artist_name: detail.data.release.artist_name || '',
      cover_url: detail.data.release.cover_url || '',
      release_type: detail.data.release.release_type || 'Album',
      release_date: detail.data.release.release_date || '',
      genre: detail.data.release.genre || '',
      description: detail.data.release.description || '',
      tracks,
    });
    setEditingReleaseId(release.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const releaseIdToEdit = searchParams.get('editRelease');
    if (!releaseIdToEdit || !releaseList.length) return;

    const release = releaseList.find((item) => String(item.id) === releaseIdToEdit);
    if (!release) return;

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('editRelease');
      return next;
    }, { replace: true });
    handleReleaseEdit(release);
  }, [releaseList, searchParams, setSearchParams]);

  useEffect(() => {
    const artistIdToEdit = searchParams.get('editArtist');
    if (!artistIdToEdit) return;

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('editArtist');
      return next;
    }, { replace: true });

    api.get(`/artists/${encodeURIComponent(artistIdToEdit)}`)
      .then((res) => handleArtistEdit({
        ...res.data.artist,
        genre_names: (res.data.genres || []).join(', '),
      }))
      .catch((error) => reportAdminError(error, 'Não foi possível carregar o artista para edição.'));
  }, [searchParams, setSearchParams]);

  const handleReleaseDelete = async (releaseId) => {
    if (!window.confirm('Deseja excluir este lançamento?')) return;
    setAdminError('');
    try {
      await api.delete(`/releases/${releaseId}`);
      alert('Lançamento removido.');
      refreshCatalogLists();
      api.get('/dashboard').then((res) => setStats(res.data)).catch(console.error);
    } catch (error) {
      reportAdminError(error, 'Não foi possível excluir o lançamento. Consulte os logs do servidor.');
    }
  };

  return (
    <div className="content-stack">
      <div className="section-header"><h2>Painel administrativo</h2></div>
      {adminError && <p className="error-text" role="alert">{adminError}</p>}

      <div className="admin-actions">
        <button type="button" className="secondary-btn" onClick={resetCatalog}>Zerar catálogo</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card glass-panel"><span>Artistas</span><strong>{stats.artists?.count || 0}</strong></div>
        <div className="stat-card glass-panel"><span>Lançamentos</span><strong>{stats.releases?.count || 0}</strong></div>
        <div className="stat-card glass-panel"><span>Usuários</span><strong>{stats.users?.count || 0}</strong></div>
        <div className="stat-card glass-panel"><span>Avaliações</span><strong>{stats.reviews?.count || 0}</strong></div>
      </div>

      <div className="admin-stack">
        <form className="admin-form glass-panel" onSubmit={submitArtist}>
          <div className="admin-form-header">
            <div>
              <h3>{editingArtistId ? 'Editar artista' : 'Criar artista'}</h3>
              <span>{editingArtistId ? 'Atualize o perfil e a identidade visual' : 'Perfil e identidade visual'}</span>
            </div>
            {editingArtistId && (
              <div className="admin-form-header-actions">
                <button type="button" className="ghost-btn compact-btn" onClick={resetArtistForm}>
                  Cancelar edição
                </button>
                <button type="button" className="ghost-btn secondary-btn" onClick={() => handleArtistDelete(editingArtistId)}>
                  Excluir artista
                </button>
              </div>
            )}
          </div>
          <input placeholder="Nome do artista" value={artistForm.name} onChange={(e) => setArtistForm({ ...artistForm, name: e.target.value })} />
          <textarea placeholder="Biografia" value={artistForm.bio} onChange={(e) => setArtistForm({ ...artistForm, bio: e.target.value })} />
          <div className="upload-grid">
            <ImageUploadField
              label="Foto do artista"
              value={artistForm.image_url}
              onChange={(value) => setArtistForm({ ...artistForm, image_url: value })}
              placeholder="https://..."
              onImageUpload={uploadImage}
              onUploadStateChange={(uploading) => setArtistImageUploads((count) => count + (uploading ? 1 : -1))}
            />
            <ImageUploadField
              label="Banner do artista"
              value={artistForm.banner_url}
              onChange={(value) => setArtistForm({ ...artistForm, banner_url: value })}
              placeholder="https://..."
              hint="JPG, PNG, GIF ou WebP de até 10 MB. Você também pode informar uma URL."
              onImageUpload={uploadImage}
              onUploadStateChange={(uploading) => setArtistImageUploads((count) => count + (uploading ? 1 : -1))}
            />
          </div>
          <input placeholder="Gêneros, separados por vírgula" value={artistForm.genres} onChange={(e) => setArtistForm({ ...artistForm, genres: e.target.value })} />
          <button type="submit" className="primary-btn" disabled={artistImageUploads > 0}>{editingArtistId ? 'Salvar alterações' : 'Criar artista'}</button>
        </form>

        <form className="admin-form glass-panel" onSubmit={submitRelease}>
          <div className="admin-form-header release-form-header">
            <div>
              <h3>{editingReleaseId ? 'Editar álbum' : 'Criar álbum'}</h3>
              <span>{editingReleaseId ? 'Atualize os dados e faixas do lançamento' : 'Álbum, EP ou single'}</span>
            </div>
            {editingReleaseId && (
              <button type="button" className="ghost-btn compact-btn" onClick={resetReleaseForm}>
                Cancelar edição
              </button>
            )}
          </div>
          <input placeholder="Título do lançamento" value={releaseForm.title} onChange={(e) => setReleaseForm({ ...releaseForm, title: e.target.value })} />
          <select
            aria-label="Artista do lançamento"
            required
            value={releaseForm.artist_id}
            onChange={(e) => {
              const selectedArtist = artistList.find((artist) => String(artist.id) === e.target.value);
              setReleaseForm({
                ...releaseForm,
                artist_id: e.target.value,
                artist_name: selectedArtist?.name || '',
              });
            }}
          >
            <option value="">{artistList.length ? 'Selecione um artista cadastrado' : 'Cadastre um artista primeiro'}</option>
            {artistList.map((artist) => (
              <option key={artist.id} value={artist.id}>{artist.name}</option>
            ))}
          </select>
          {!artistList.length && <p className="image-drop-hint">Crie um artista no formulário acima para vinculá-lo a este lançamento.</p>}
          <ImageUploadField
            label="Capa do lançamento"
            value={releaseForm.cover_url}
            onChange={(value) => setReleaseForm({ ...releaseForm, cover_url: value })}
            placeholder="https://..."
            onImageUpload={uploadImage}
            onUploadStateChange={setIsReleaseCoverUploading}
          />
          <select value={releaseForm.release_type} onChange={(e) => setReleaseForm({ ...releaseForm, release_type: e.target.value })}>
            <option>Album</option>
            <option>EP</option>
            <option>Single</option>
          </select>
          <input type="date" value={releaseForm.release_date} onChange={(e) => setReleaseForm({ ...releaseForm, release_date: e.target.value })} />
          <input placeholder="Gênero" value={releaseForm.genre} onChange={(e) => setReleaseForm({ ...releaseForm, genre: e.target.value })} />
          <textarea placeholder="Descrição" value={releaseForm.description} onChange={(e) => setReleaseForm({ ...releaseForm, description: e.target.value })} />

          <div className="track-editor">
            <div className="track-editor-header">
              <div>
                <h4>Faixas do álbum</h4>
                <p>Edite os dados principais e expanda os detalhes quando precisar.</p>
              </div>
              <button type="button" className="secondary-btn compact-btn" onClick={addTrackRow}>+ Adicionar faixa</button>
            </div>
            {releaseForm.tracks.map((track, index) => (
              <div key={track.id ? `track-${track.id}` : `draft-${index}`} className="track-row track-editor-card glass-panel">
                <div className="track-editor-card-heading">
                  <span className="track-editor-number">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>Faixa {index + 1}</strong>
                    <small>{track.title || 'Adicione o título da música'}</small>
                  </div>
                  {releaseForm.tracks.length > 1 && (
                    <button type="button" className="ghost-btn compact-btn track-editor-remove" onClick={() => removeTrackRow(index)}>
                      Remover
                    </button>
                  )}
                </div>

                <div className="track-editor-main-grid">
                  <input aria-label={`Nome da faixa ${index + 1}`} value={track.title} onChange={(e) => updateTrack(index, 'title', e.target.value)} placeholder="Nome da faixa" />
                  <input aria-label={`Duração da faixa ${index + 1}`} value={track.duration} onChange={(e) => updateTrack(index, 'duration', e.target.value)} placeholder="Duração (ex.: 3:42)" />
                  <label className="check-inline">
                    <input type="checkbox" checked={track.explicit} onChange={(e) => updateTrack(index, 'explicit', e.target.checked)} />
                    Explícita
                  </label>
                </div>

                <details className="track-editor-details">
                  <summary>Letra, tradução e link do YouTube</summary>
                  <div className="track-editor-extra">
                    <input aria-label={`Link do YouTube da faixa ${index + 1}`} value={track.youtube_url} onChange={(e) => updateTrack(index, 'youtube_url', e.target.value)} placeholder="Link do YouTube" />
                    <div className="track-editor-lyrics-grid">
                      <label>
                        Letra original
                        <textarea value={track.lyrics} onChange={(e) => updateTrack(index, 'lyrics', e.target.value)} placeholder="Cole a letra aqui" rows="4" />
                      </label>
                      <label>
                        Tradução
                        <textarea value={track.translation} onChange={(e) => updateTrack(index, 'translation', e.target.value)} placeholder="Cole a tradução aqui" rows="4" />
                      </label>
                    </div>
                  </div>
                </details>
              </div>
            ))}
          </div>

          <button type="submit" className="primary-btn" disabled={isReleaseCoverUploading}>{editingReleaseId ? 'Salvar alterações' : 'Criar lançamento'}</button>
        </form>

        <form className="admin-form glass-panel" onSubmit={submitFeatured}>
          <div className="admin-form-header">
            <h3>Criar destaque</h3>
            <span>Carrossel da página inicial</span>
          </div>
          <select value={featuredForm.release_id} onChange={(e) => setFeaturedForm({ ...featuredForm, release_id: e.target.value })}>
            <option value="">Selecione um lançamento</option>
            {releaseList.map((release) => (
              <option key={release.id} value={release.id}>{release.title} • {release.artist_name}</option>
            ))}
          </select>
          <input type="number" min="1" value={featuredForm.sort_order} onChange={(e) => setFeaturedForm({ ...featuredForm, sort_order: e.target.value })} placeholder="Ordem do destaque" />
          <button type="submit" className="primary-btn">Salvar destaque</button>
        </form>
      </div>

      <div className="admin-listing-panel glass-panel">
        <div className="section-header compact">
          <h3>Artistas cadastrados</h3>
        </div>
        <div className="admin-list-grid">
          {artistList.map((artist) => (
            <div key={artist.id} className="admin-list-item">
              <img src={artist.image_url || artist.banner_url || getArtistFallbackImage(artist)} onError={(event) => handleImageError(event, getArtistFallbackImage(artist))} alt={artist.name} />
              <div>
                <strong>{artist.name}</strong>
                <small>{artist.genre_names || artist.genre || 'Sem gênero'}</small>
              </div>
              <div className="admin-list-actions">
                <button type="button" className="secondary-btn compact-btn" onClick={() => handleArtistEdit(artist)}>Editar</button>
                <button type="button" className="ghost-btn compact-btn" onClick={() => handleArtistDelete(artist.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-listing-panel glass-panel">
        <div className="section-header compact">
          <h3>Lançamentos cadastrados</h3>
        </div>
        <div className="admin-list-grid">
          {releaseList.map((release) => (
            <div key={release.id} className="admin-list-item">
              <img src={release.cover_url || getReleaseFallbackImage(release)} onError={(event) => handleImageError(event, getReleaseFallbackImage(release))} alt={release.title} />
              <div>
                <strong>{release.title}</strong>
                <small>{release.artist_name} • {release.release_type}</small>
              </div>
              <div className="admin-list-actions">
                <button type="button" className="secondary-btn compact-btn" onClick={() => handleReleaseEdit(release)}>Editar</button>
                <button type="button" className="danger-btn compact-btn" onClick={() => handleReleaseDelete(release.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RatingBadge({ value }) {
  const color = value >= 8 ? 'green' : value >= 6 ? 'orange' : 'red';
  return <span className={`rating-badge ${color}`}>{value || 0}</span>;
}
