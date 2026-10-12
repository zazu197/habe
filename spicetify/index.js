function RiffifyApp() {
  const React = Spicetify.React;
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    const connection = window.RiffifyConnection;
    if (!connection) { setError('Run npm run install:spotify to pair the local companion.'); return; }
    const frame = document.createElement('iframe');
    frame.id = 'riffify-frame'; frame.title = 'Riffify · original Riff';
    frame.src = `${connection.origin}/session/${connection.token}/ui/`;
    frame.referrerPolicy = 'no-referrer'; frame.allow = 'autoplay; fullscreen';
    document.body.append(frame); document.body.classList.add('riffify-active');
    window.RiffifyFrame = frame;
    return () => { window.RiffifyFrame = null; frame.remove(); document.body.classList.remove('riffify-active'); };
  }, []);
  return React.createElement('div', { style: { padding: '48px' } }, error || 'Riffify is opening. Start the local companion with npm start if it is offline.');
}
function render() { return Spicetify.React.createElement(RiffifyApp); }
