// Fake login gate -- docs/design/14-admin-mockup.md: accepts any
// non-empty input (or a hardcoded demo credential) and flips an
// in-memory isMockAuthed flag. Grants NO real security; its only jobs
// are to show Mel roughly where the real login will sit and keep casual
// eyes off the mockup.
//
// This component calls the same api/auth.ts login() the real backend will
// answer -- it does not know MSW exists (doc 14's "component does not
// change" contract). The demo-password hint below is mockup UX, not a
// real credential.

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { login } from "../../../api/auth";
import { Field } from "../../../components/Field";
import { BigButton } from "../../../components/BigButton";

export function AdminLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/admin", { replace: true });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Admin login
      </h1>
      <p className="mt-2 text-lg text-mp-muted">
        Mockup gate -- any email + password <code>letmein</code>.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
        <Field
          id="email"
          label="Email address"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          errorMessage={mutation.isError ? "Invalid email or password" : undefined}
        />
        <BigButton type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Signing in..." : "Sign in"}
        </BigButton>
      </form>
    </main>
  );
}
