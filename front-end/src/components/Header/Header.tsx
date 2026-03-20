import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <div className="container header-inner">
        <Link to="/" className="brand">
          <span className="brand-accent">Frank<b>!</b></span>Gateway
        </Link>

        <nav className="nav-links">
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Dashboard
          </NavLink>

          <NavLink to="/loadConfig" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Schema Validation
          </NavLink>

          <NavLink to="/config" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Config
          </NavLink>
          {/*<NavLink to="/routes" className={({ isActive }) => (isActive ? 'active' : undefined)}>*/}
          {/*  Routes*/}
          {/*</NavLink>*/}
          {/*<NavLink to="/designer" className={({ isActive }) => (isActive ? 'active' : undefined)}>*/}
          {/*  Designer*/}
          {/*</NavLink>*/}
          {/*<NavLink to="/schema" className={({ isActive }) => (isActive ? 'active' : undefined)}>*/}
          {/*  Schema*/}
          {/*</NavLink>*/}
          {/*<NavLink to="/gitConfig" className={({ isActive }) => (isActive ? 'active' : undefined)}>*/}
          {/*  Git*/}
          {/*</NavLink>*/}
        </nav>

        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
