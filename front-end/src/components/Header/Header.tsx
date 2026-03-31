import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { useConfigManager } from '../../hooks/useConfigManager';
import styles from './Header.module.css';

export const Header: React.FC = () => {
  const { schema, schemaLoading, fetchSchema } = useConfigManager();

  return (
    <header className={styles.appHeader}>
      <div className={`container ${styles.headerInner}`}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandAccent}>Frank<b>!</b></span>Gateway
        </Link>

        <nav className={styles.navLinks}>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Dashboard
          </NavLink>

          <NavLink to="/loadConfig" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Config Validation
          </NavLink>

          <NavLink to="/config" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Config
          </NavLink>
          <NavLink to="/designer" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Designer
          </NavLink>
        </nav>

        <div className={styles.headerActions}>
          <div className={`${schema ? "text-success" : "text-muted"} text-small ${styles.schemaStatus}`}>
            {schema ? 'Schema Active' : 'Schema Missing'}
          </div>
          <button
            onClick={() => fetchSchema().catch(() => {})}
            disabled={schemaLoading}
            className={schemaLoading ? "" : "btn-primary"}
          >
            {schemaLoading ? 'Fetching...' : 'Fetch Schema'}
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
