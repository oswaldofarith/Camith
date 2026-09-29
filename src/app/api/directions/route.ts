import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get('origin');
  const destination = searchParams.get('destination');
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!origin || !destination) {
    return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 });
  }

  if (!apiKey) {
    console.error("[API /directions] Google Maps API key is not configured on the server.");
    return NextResponse.json({ error: 'API key is not configured' }, { status: 500 });
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.routes.length > 0) {
      const leg = data.routes[0].legs[0];
      const durationInMinutes = Math.ceil(leg.duration.value / 60);
      return NextResponse.json({ duration: durationInMinutes });
    } else {
      console.warn(`[API /directions] Directions API failed: ${data.status}`, data.error_message || '');
      // Return a fallback duration if the API call fails
      return NextResponse.json({ duration: 15 });
    }
  } catch (error) {
    console.error("[API /directions] Error fetching travel time:", error);
    return NextResponse.json({ error: 'Failed to fetch travel time' }, { status: 500 });
  }
}
