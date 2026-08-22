import { Card, CardContent } from '@workspace/geslaagd-momentum/components/ui/card';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { ArrowLeft, Compass } from 'lucide-react';
import { useLocation } from 'wouter';

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <main className="not-found-page">
      <Card className="not-found-card">
        <CardContent>
          <span className="not-found-icon"><Compass size={22} /></span>
          <p className="page-kicker">pagina niet gevonden</p>
          <h1>Hier loopt het pad dood.</h1>
          <p>Deze pagina bestaat niet. Ga terug naar je vertrouwde vertrekpunt.</p>
          <Button type="button" onClick={() => setLocation('/')}><ArrowLeft size={16} /> Naar de homepage</Button>
        </CardContent>
      </Card>
    </main>
  );
}
