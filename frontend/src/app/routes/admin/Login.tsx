// Real admin login -- see docs/design/02-auth-and-security.md. Calls
// api/auth.ts's login(), which the real backend answers (api/auth.py);
// only the fully-mocked VITE_USE_MOCKS=true build (mocks/handlers.ts)
// still fakes this endpoint, per docs/design/14's graduation checklist.

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
