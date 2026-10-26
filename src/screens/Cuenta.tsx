import { Link } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { Chip, ChipRow } from '../components/Chip';
import { Icon } from '../components/Icon';
import { Screen, SectionHeader } from '../components/Screen';
import { useAppState } from '../state/AppState';
import './screens.css';

export function Cuenta() {
  const { theme, setTheme } = useAppState();

  return (
    <Screen footer={<BottomNav />}>
      <h1 className="t-title">Cuenta</h1>

      <section className="stack-12">
        <SectionHeader title="Tema" />
        <ChipRow label="Tema">
          <Chip selected={theme === 'dark'} onToggle={() => setTheme('dark')}>
            Oscuro
          </Chip>
          <Chip selected={theme === 'light'} onToggle={() => setTheme('light')}>
            Claro
          </Chip>
        </ChipRow>
      </section>

      <section className="stack-12">
        <SectionHeader title="¿Eres barbero?" />
        <Link to="/soy-barbero" className="promo">
          <span className="promo__ribbon polo-ribbon" aria-hidden="true" />
          <span className="promo__body">
            <span className="t-card-title">Muestra tus cortes</span>
            <span className="t-detail">Crea tu cuenta de barbero por $3.99 al mes.</span>
          </span>
          <Icon name="chevron" size={22} />
        </Link>
      </section>
    </Screen>
  );
}
