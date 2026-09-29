# AMI-FieldWorkManager

AMI-FieldWorkManager is a comprehensive solution designed to streamline and optimize field service operations. It provides dispatchers, supervisors, and field technicians with the tools they need to manage work orders, track assets, and optimize routes efficiently.

## Core Features

*   **KPI Dashboard:** A real-time dashboard visualizing key performance indicators (KPIs) such as daily orders, pending jobs, and completed jobs, offering a clear overview of operational efficiency.
*   **Interactive Map:** Utilizes the Google Maps API to display equipment locations, work order routes, and provides a centralized view for dispatch and tracking.
*   **Dispatching Interface:** A drag-and-drop interface for dispatchers to assign pending service requests to field units directly on the map.
*   **AI-Powered Route Optimization:** Leverages Genkit and Google's AI models to suggest optimal routes for field teams, considering traffic, technician skills, and equipment locations to minimize travel time.
*   **PDF Work Order Generation:** Automatically generates printable work orders in PDF format, pre-filled with relevant job details, equipment information, and assigned technicians.
*   **User & Asset Management:** Comprehensive modules for managing users (technicians, supervisors, admins), vehicles, and equipment.

## Tech Stack

This application is built with a modern, robust, and scalable tech stack:

*   **Framework:** [Next.js](https://nextjs.org/) (App Router)
*   **UI Library:** [React](https://react.dev/) with [ShadCN UI](https://ui.shadcn.com/) components
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
*   **Backend & Database:** [Firebase](https://firebase.google.com/) (Authentication, Firestore)
*   **Generative AI:** [Genkit](https://firebase.google.com/docs/genkit) for AI-powered features like route optimization.
*   **Mapping:** [Google Maps Platform](https://developers.google.com/maps)

## Getting Started

### Prerequisites

*   Node.js (v18 or later)
*   NPM or Yarn
*   A Firebase project

### Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Firebase Configuration:**
    *   Create a `.env.local` file in the root of your project.
    *   Add your Firebase project's configuration keys to this file. You can get these from your Firebase project settings.
        ```
        NEXT_PUBLIC_FIREBASE_API_KEY=...
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
        NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
        NEXT_PUBLIC_FIREBASE_APP_ID=...
        ```
    *   **Service Account for Admin Actions:** Download your Firebase project's service account key (`serviceAccountKey.json`) from the Firebase Console (`Project Settings > Service accounts`) and place it in the root directory of the project. This is required for server-side admin tasks like managing users.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:9002`.

## Project Structure

A brief overview of the key directories:

*   `src/app/(app)/`: Contains the main application routes and pages, protected by authentication.
*   `src/app/login/`: The application's login page.
*   `src/app/print/`: Contains layouts for printable versions of documents like work orders.
*   `src/components/`: Shared React components used throughout the application.
*   `src/contexts/`: React context providers, including the `AuthContext`.
*   `src/services/`: Contains all the logic for interacting with Firebase services (Firestore, Auth).
*   `src/ai/`: Home for all Genkit-related code, including AI flows.
*   `src/types/`: TypeScript type definitions for the application's data structures.
*   `firestore.rules`: Security rules for the Firestore database.
