
import { Link } from 'react-router-dom';
import styles from './Routes.module.css';

export const CreateRoute = () => {
  return (
    <div className={`card ${styles.createCard}`}>
      <p>Want to create a new route in your YAML configuration?</p>
      <Link to="/designer">
        <button className="btn-primary">
          Open Route Designer
        </button>
      </Link>
    </div>
  );
};