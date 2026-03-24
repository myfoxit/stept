"""Command line interface for Stept."""

import asyncio
import click
import json
import sys
from pathlib import Path

from .agent import Agent
from .replay import ReplayEngine
from .storage.local import LocalStorage
from .storage.remote import RemoteStorage


@click.group()
@click.option('--verbose', '-v', is_flag=True, help='Enable verbose logging')
def cli(verbose):
    """Stept - Browser automation with memory."""
    import logging
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format='%(asctime)s - %(levelname)s - %(message)s')


@cli.command()
@click.argument('task')
@click.option('--url', help='Starting URL')
@click.option('--headless/--headed', default=True, help='Browser mode')
@click.option('--max-steps', default=30, help='Maximum steps')
@click.option('--recordings-dir', help='Local recordings directory')
@click.option('--server-url', help='Stept server URL')
@click.option('--api-key', help='API key for server')
@click.option('--llm', help='LLM provider (openai, anthropic, etc.)')
@click.option('--model', help='LLM model name')
def run(task, url, headless, max_steps, recordings_dir, server_url, api_key, llm, model):
    """Run a task (auto-selects mode based on recordings)."""
    async def _run():
        # Setup LLM client (placeholder - implement based on your needs)
        llm_client = None
        if llm:
            if llm == 'openai' and model:
                try:
                    import openai
                    llm_client = openai.AsyncOpenAI()  # You'd configure this properly
                except ImportError:
                    click.echo("OpenAI package not installed", err=True)
                    return
            # Add other LLM providers as needed
        
        agent = Agent(
            task=task,
            llm_client=llm_client,
            url=url,
            headless=headless,
            max_steps=max_steps,
            recordings_dir=recordings_dir,
            server_url=server_url,
            api_key=api_key
        )
        
        result = await agent.run()
        
        # Display results
        status = "✓ SUCCESS" if result.success else "✗ FAILED"
        click.echo(f"{status} - {result.mode.value} mode")
        click.echo(f"Steps: {len(result.steps)}")
        click.echo(f"Time: {result.total_time_ms}ms")
        click.echo(f"LLM Cost: ${result.total_llm_cost:.3f}")
        
        if result.recording_reuse_rate > 0:
            click.echo(f"Recording Reuse: {result.recording_reuse_rate:.1%}")
        
        if result.recording_id:
            click.echo(f"Saved as recording: {result.recording_id}")
        
        if not result.success and result.steps:
            last_error = next((s.error for s in reversed(result.steps) if s.error), None)
            if last_error:
                click.echo(f"Error: {last_error}", err=True)
    
    asyncio.run(_run())


@cli.command()
@click.argument('recording_id')
@click.option('--url', help='Starting URL (overrides recording)')
@click.option('--headless/--headed', default=True)
@click.option('--retries', default=2, help='Max retry attempts')
@click.option('--recordings-dir', help='Local recordings directory')
@click.option('--server-url', help='Stept server URL')
@click.option('--api-key', help='API key for server')
def replay(recording_id, url, headless, retries, recordings_dir, server_url, api_key):
    """Replay a specific recording by ID."""
    async def _replay():
        engine = ReplayEngine(
            headless=headless,
            recordings_dir=recordings_dir,
            server_url=server_url,
            api_key=api_key
        )
        
        result = await engine.replay_recording(recording_id, url, retries)
        
        status = "✓ SUCCESS" if result.success else "✗ FAILED"
        click.echo(f"{status}")
        click.echo(f"Steps: {len(result.steps)}/{result.steps and 'unknown' or 0}")
        click.echo(f"Time: {result.total_time_ms}ms")
        
        if not result.success and result.steps:
            failed_step = next((i for i, s in enumerate(result.steps) if not s.success), None)
            if failed_step is not None:
                click.echo(f"Failed at step: {failed_step + 1}")
                click.echo(f"Error: {result.steps[failed_step].error}")
    
    asyncio.run(_replay())


@cli.group()
def recordings():
    """Manage recordings."""
    pass


@recordings.command()
@click.option('--recordings-dir', help='Local recordings directory')
@click.option('--server-url', help='Stept server URL')
@click.option('--api-key', help='API key for server')
@click.option('--format', default='table', type=click.Choice(['table', 'json']))
def list(recordings_dir, server_url, api_key, format):
    """List all recordings."""
    async def _list():
        if server_url:
            storage = RemoteStorage(server_url, api_key, fallback_to_local=True)
        else:
            storage = LocalStorage(recordings_dir)
        
        recordings_list = await storage.list_recordings()
        
        if format == 'json':
            data = [r.model_dump() for r in recordings_list]
            click.echo(json.dumps(data, indent=2))
        else:
            if not recordings_list:
                click.echo("No recordings found")
                return
            
            click.echo(f"{'ID':<36} {'Name':<30} {'Steps':<6} {'Success':<7} {'Source'}")
            click.echo("-" * 90)
            
            for rec in recordings_list:
                success_rate = rec.success_count / max(rec.success_count + rec.fail_count, 1)
                click.echo(
                    f"{rec.id:<36} {rec.name[:30]:<30} {len(rec.steps):<6} "
                    f"{success_rate:.1%:<7} {rec.source}"
                )
    
    asyncio.run(_list())


@recordings.command()
@click.argument('recording_id')
@click.option('--recordings-dir', help='Local recordings directory')
@click.option('--server-url', help='Stept server URL')
@click.option('--api-key', help='API key for server')
def show(recording_id, recordings_dir, server_url, api_key):
    """Show details of a recording."""
    async def _show():
        if server_url:
            storage = RemoteStorage(server_url, api_key, fallback_to_local=True)
        else:
            storage = LocalStorage(recordings_dir)
        
        recording = await storage.get_recording(recording_id)
        if not recording:
            click.echo(f"Recording not found: {recording_id}", err=True)
            return
        
        click.echo(f"ID: {recording.id}")
        click.echo(f"Name: {recording.name}")
        click.echo(f"URL Pattern: {recording.url_pattern or 'None'}")
        click.echo(f"Steps: {len(recording.steps)}")
        click.echo(f"Source: {recording.source}")
        click.echo(f"Success: {recording.success_count}")
        click.echo(f"Failures: {recording.fail_count}")
        click.echo(f"Last run: {recording.last_run_at or 'Never'}")
        click.echo("")
        click.echo("Steps:")
        
        for i, step in enumerate(recording.steps, 1):
            desc = step.description or f"{step.action} action"
            click.echo(f"  {i:2d}. {step.action:<8} {desc}")
    
    asyncio.run(_show())


@recordings.command()
@click.argument('recording_id')
@click.option('--format', default='playwright', type=click.Choice(['playwright', 'json']))
@click.option('--output', '-o', help='Output file path')
@click.option('--recordings-dir', help='Local recordings directory')
@click.option('--server-url', help='Stept server URL')
@click.option('--api-key', help='API key for server')
def export(recording_id, format, output, recordings_dir, server_url, api_key):
    """Export recording in different formats."""
    async def _export():
        engine = ReplayEngine(
            recordings_dir=recordings_dir,
            server_url=server_url,
            api_key=api_key
        )
        
        try:
            if format == 'json':
                if server_url:
                    storage = RemoteStorage(server_url, api_key, fallback_to_local=True)
                else:
                    storage = LocalStorage(recordings_dir)
                
                recording = await storage.get_recording(recording_id)
                if not recording:
                    click.echo(f"Recording not found: {recording_id}", err=True)
                    return
                
                code = recording.model_dump_json(indent=2)
            else:
                code = await engine.export_recording_as_code(recording_id, format, output)
            
            if output:
                click.echo(f"Exported to: {output}")
            else:
                click.echo(code)
                
        except ValueError as e:
            click.echo(str(e), err=True)
    
    asyncio.run(_export())


@cli.command()
@click.argument('recording_id')
@click.option('--runs', default=5, help='Number of benchmark runs')
@click.option('--url', help='Starting URL')
@click.option('--recordings-dir', help='Local recordings directory')
@click.option('--server-url', help='Stept server URL')
@click.option('--api-key', help='API key for server')
def benchmark(recording_id, runs, url, recordings_dir, server_url, api_key):
    """Benchmark recording performance."""
    async def _benchmark():
        engine = ReplayEngine(
            headless=True,  # Force headless for benchmarking
            recordings_dir=recordings_dir,
            server_url=server_url,
            api_key=api_key
        )
        
        click.echo(f"Benchmarking recording {recording_id} with {runs} runs...")
        
        results = await engine.benchmark_recording(recording_id, runs, url)
        
        if 'error' in results:
            click.echo(f"Error: {results['error']}", err=True)
            return
        
        click.echo(f"\\nResults:")
        click.echo(f"Success Rate: {results['success_rate']:.1%}")
        click.echo(f"Average Time: {results['avg_time_ms']}ms")
        click.echo(f"Min Time: {results['min_time_ms']}ms") 
        click.echo(f"Max Time: {results['max_time_ms']}ms")
        
        if 'common_failure_steps' in results:
            click.echo(f"\\nCommon failure points:")
            for step, count in results['common_failure_steps'].items():
                click.echo(f"  Step {step}: {count} failures")
    
    asyncio.run(_benchmark())


@cli.command()
@click.option('--dataset', default='webvoyager', help='Benchmark dataset (webvoyager)')
@click.option('--model', default='gpt-4o', help='LLM model to use')
@click.option('--mode', default='agent', type=click.Choice(['agent', 'replay', 'hybrid', 'compare']), help='Execution mode')
@click.option('--sites', default=None, help='Comma-separated site filter (e.g., "Amazon,Google Search")')
@click.option('--limit', default=None, type=int, help='Max tasks to run')
@click.option('--headless/--headed', default=True, help='Run browser headless')
@click.option('--results-dir', default='~/.stept/benchmark/results', help='Results output directory')
def bench(dataset, model, mode, sites, limit, headless, results_dir):
    """Run WebVoyager benchmark — compare stept against browser-use and Skyvern."""
    from .benchmark import load_webvoyager_dataset, BenchmarkRunner, run_comparison_benchmark

    async def _bench():
        site_list = [s.strip() for s in sites.split(',')] if sites else None
        tasks = await load_webvoyager_dataset(sites=site_list, limit=limit)
        
        if not tasks:
            click.echo("No benchmark tasks found.", err=True)
            return
        
        click.echo(f"Running {len(tasks)} benchmark tasks with {model} in {mode} mode...")
        
        if mode == 'compare':
            reports = await run_comparison_benchmark(
                tasks, model=model, headless=headless, results_dir=results_dir
            )
        else:
            runner = BenchmarkRunner(
                model=model, mode=mode, headless=headless, results_dir=results_dir
            )
            report = await runner.run(
                tasks,
                on_progress=lambda i, n, t: click.echo(f"  [{i+1}/{n}] {t.web_name}: {t.question[:50]}..."),
            )

    asyncio.run(_bench())


def main():
    """Entry point for the CLI."""
    try:
        cli()
    except KeyboardInterrupt:
        click.echo("\\nInterrupted by user", err=True)
        sys.exit(1)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


if __name__ == '__main__':
    main()