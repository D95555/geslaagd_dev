import { ArrowLeft } from "lucide-react";
import { Button } from "@workspace/geslaagd-momentum/components/ui/button";
import { Card, CardContent } from "@workspace/geslaagd-momentum/components/ui/card";
import { Shell, Brand } from "./_shared/Frame";
export default function NotFound() { return <Shell className="grid place-items-center"><Card><CardContent className="p-10 text-center"><Brand /><p className="meta mt-12 text-muted-foreground">404 · niet gevonden</p><h1 className="display mt-4 text-4xl">Deze route bestaat niet.</h1><p className="mt-3 text-muted-foreground">Ga terug naar een plek waar je verder kunt.</p><Button className="mt-6"><ArrowLeft /> Naar de homepage</Button></CardContent></Card></Shell>; }