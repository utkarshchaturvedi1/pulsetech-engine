"use client";

import { useEffect, useState } from "react";

type Props = {
  onComplete: () => void;
};

const STEPS = [
  "Website analysed",
  "24 pages processed",
  "18 services identified",
  "9 service areas found",
  "Business profile created",
  "Brand colours extracted",
  "AI Sales Employee created",
];

export default function AICreationScreen({ onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let step = -1;

    const interval = setInterval(() => {
      step++;

      if (step < STEPS.length) {
        setCurrentStep(step);
      } else {
        clearInterval(interval);
        setFinished(true);
      }
    }, 350);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md">

      <div className="w-full max-w-2xl rounded-3xl bg-slate-900 p-10 shadow-2xl">

        <h1 className="text-3xl font-bold text-white">
          ⚡ Creating Your AI Sales Employee
        </h1>

        <p className="mt-3 text-slate-400">
          Please wait while we create your personalised AI.
        </p>

        <div className="mt-10 space-y-4">

          {STEPS.map((step, index) => (
            <div
              key={step}
              className="flex items-center gap-4"
            >
              <div className="w-6 text-center text-green-400">
                {index <= currentStep ? "✓" : ""}
              </div>

              <div
                className={
                  index <= currentStep
                    ? "text-white"
                    : "text-slate-600"
                }
              >
                {step}
              </div>
            </div>
          ))}

        </div>

        {finished && (
          <>

            <div className="mt-10 rounded-2xl bg-green-600 p-5 text-center">

              <div className="text-2xl font-bold text-white">
                🎉 Your AI Sales Employee is Ready
              </div>

            </div>

            <p className="mt-6 text-center text-slate-300 leading-7">

              Take a few minutes to experience your AI exactly as one of your
              customers would.

              <br />

              If you'd like anything changed, your PulseTech Assistant will
              update it immediately.

            </p>

            <div className="mt-8 flex justify-center">

              <button
                onClick={onComplete}
                className="rounded-2xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white transition hover:bg-blue-700"
              >
                Start Testing Your AI
              </button>

            </div>

          </>
        )}

      </div>

    </div>
  );
}