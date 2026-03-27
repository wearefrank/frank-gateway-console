import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

export const ThemeToggle = () => {

  // current theme
  const [theme, setTheme] = useState<string>(() => {
    const saved = localStorage.getItem('theme');

    if (saved) return saved;

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; // returns dark or light
  });

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // set theme on load
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const icon = theme === 'dark' ? '☀︎' : '☾';

  return (
    <button
      className="icon-btn"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className={styles.icon}>{icon}</span>
    </button>
  );
};
