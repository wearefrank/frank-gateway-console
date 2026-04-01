import styles from './App.module.css'
import {Routes, Route} from 'react-router-dom';
import {Dashboard} from "./components/Dashboard/Dashboard.tsx";
import {Config} from "./pages/config/Config.tsx";
import {RouteOverview} from "./components/Routes/RouteOverview.tsx";
import {SchemaPage} from "./pages/schema/SchemaPage.tsx";
import {RouteDesigner} from "./pages/designer/RouteDesigner.tsx";
import {GitConfig} from "./pages/gitConfig/GitConfig.tsx";
import RouteFlow from "./pages/graphflow/RouteFlow.tsx";
import {ApisixConfigLoader} from "./pages/configloader/configLoader.tsx";
import { Header } from "./components/Header/Header.tsx";
import { ConfigManagerProvider } from "./providers/ConfigManagerProvider.tsx";

const Home = () => {
    return (
        <div className={`container ${styles.homePage}`}>
            <h1 className={styles.homeTitle}>WeAreFrank APISIX</h1>
            <p className="text-muted">Use the navigation above to explore the app.</p>
        </div>
    );
};

function App() {
    return (
        <ConfigManagerProvider>
            <>
                <Header />
                <Routes>
                    <Route path="/" element={<Home/>} />
                    <Route path="/dashboard" element={<Dashboard/>} />
                    <Route path="/config" element={<Config/>} />
                    <Route path="/routes" element={<RouteOverview/>} />
                    <Route path="/schema" element={<SchemaPage/>} />
                    <Route path="/designer" element={<RouteDesigner/>} />
                    <Route path="/gitConfig" element={<GitConfig/>} />
                    <Route path="/flow" element={<RouteFlow/>} />
                    <Route path="/loadConfig" element={<ApisixConfigLoader/>} />
                </Routes>
            </>
        </ConfigManagerProvider>
    )
}

export default App