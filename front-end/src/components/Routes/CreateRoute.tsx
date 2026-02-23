
import { Link } from 'react-router-dom';

export const CreateRoute = () => {
  return (
    <div className="card" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
      <p>Want to create a new route in your YAML configuration?</p>
      <Link to="/designer">
        <button className="btn-primary">
          Open Route Designer
        </button>
      </Link>
    </div>
  );
};