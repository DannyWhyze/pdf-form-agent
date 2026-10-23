import argparse
import asyncio
import sys
from pathlib import Path

from src.config import DATA_DIR, SESSIONS_DIR
from src.core.agent import PDFFormAgent
from src.core.tools import read_pdf_form


async def run_cli(pdf_path: str, thread_id: str = "cli_session"):
    source_path = Path(pdf_path).resolve()
    if not source_path.exists():
        print(f"Error: File '{pdf_path}' does not exist.")
        sys.exit(1)

    # Copy / link to data directory for the session
    if SESSIONS_DIR.exists() and SESSIONS_DIR.is_relative_to(DATA_DIR):
        session_dir = SESSIONS_DIR / thread_id
    else:
        session_dir = DATA_DIR / thread_id
    session_dir.mkdir(parents=True, exist_ok=True)
    target_file = session_dir / source_path.name

    with open(source_path, "rb") as src, open(target_file, "wb") as dst:
        dst.write(src.read())

    print(f"Loaded PDF '{source_path.name}' into session '{thread_id}'.")

    # Initial check of fields
    config = {"configurable": {"thread_id": thread_id}}
    summary = read_pdf_form.invoke({"filepath": source_path.name}, config=config)
    print(f"Form inspection:\n{summary}\n")

    agent = PDFFormAgent()
    print("Agent initialized. Type your responses (or 'exit' / 'quit' to end):")
    print("-" * 60)

    # Initial greeting trigger
    initial_prompt = (
        f"Ich habe das Formular '{source_path.name}' hochgeladen. "
        "Bitte lies die Felder aus und führe mich durch das Ausfüllen."
    )
    print("User: [Formular hochgeladen]")
    print("Agent: ", end="", flush=True)

    async for event in agent.astream_events(initial_prompt, thread_id=thread_id):
        if event.get("event") == "thought" and event.get("data"):
            print(f"\n[Thinking: {event['data']}]", end="", flush=True)
        elif event.get("event") == "token" and event.get("data"):
            print(event["data"], end="", flush=True)
    print()

    while True:
        try:
            user_input = input("\nYou: ").strip()
            if not user_input or user_input.lower() in ["exit", "quit", "q"]:
                print("Exiting PDF Form Agent CLI.")
                break

            print("\nAgent: ", end="", flush=True)
            async for event in agent.astream_events(user_input, thread_id=thread_id):
                if event.get("event") == "thought" and event.get("data"):
                    print(f"\n[Thinking: {event['data']}]", end="", flush=True)
                elif event.get("event") == "token" and event.get("data"):
                    print(event["data"], end="", flush=True)
            print()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break


def main():
    parser = argparse.ArgumentParser(description="Interactive PDF Form Filling Agent CLI")
    parser.add_argument("pdf", help="Path to the PDF form file to fill")
    parser.add_argument("--thread-id", default="cli_session", help="Session Thread ID")
    args = parser.parse_args()

    asyncio.run(run_cli(args.pdf, args.thread_id))


if __name__ == "__main__":
    main()
