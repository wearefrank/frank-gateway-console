import {Routes, Route} from 'react-router-dom';
import {Dashboard} from "./components/Dashboard/Dashboard.tsx";
import {Config} from "./pages/config/Config.tsx";
import {RouteDesigner} from "./pages/designer/RouteDesigner.tsx";
import {ApisixConfigLoader} from "./pages/configloader/configLoader.tsx";
import { Header } from "./components/Header/Header.tsx";
import { ConfigManagerProvider } from "./providers/ConfigManagerProvider.tsx";

function App() {
    return (
        <ConfigManagerProvider>
            <>
                <Header />
                <Routes>
                    <Route path="/" element={<Dashboard/>} />
                    <Route path="/dashboard" element={<Dashboard/>} />
                    <Route path="/config" element={<Config/>} />
                    <Route path="/designer" element={<RouteDesigner/>} />
                    <Route path="/loadConfig" element={<ApisixConfigLoader/>} />
                </Routes>
            </>
        </ConfigManagerProvider>
    )
}

export default App