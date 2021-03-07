'use strict';

const e = React.createElement;

class StoryButton extends React.Component {
  constructor(props) {
    super(props);
    this.state = {open: false};
  }

  render() {
    return (
        <section>
          <button className={'btn '+(this.state.open && 'btn_pressed')} type="button" onClick={()=>this.setState({open: !this.state.open})}>Story</button>
          { this.state.open &&
            (<div className="pt1">
              My passion for programming has started in school.<br/>
              In 2004 I've started making money by making websites.<br/>
              One of my first tools was FTP-editor - tool to upload, remove and edit files (mostly PHP-scripts). It was designed to be used from a mobile phone (in 2004, not every Russian youngster had a computer, so "mobile-first" for us was more than a motto).<br/>
              But the most interesting thing about that editor - development of this tool had just 3 computer hours and the rest of the code was written using this editor itself (yes, from a mobile phone).<br/>
              This tool helped dozens of people to create their first web sites (or WAP-sites).<br/>
              It was challenging but extremely rewarding.
            </div>)
          }
        </section>
    );
  }
}

class RevealEmail extends React.Component {
  constructor(props) {
    super(props);
    this.state = {open: false};
    this.email = null;
    if (props && props.email) {
      this.email = props.email.replace(' at ', '@').replace('_dotcom', '.com').replace('_dotdev', '.dev');
    }
  }

  render() {
    return (
        <span>
          {
            this.state.open 
                ? <strong>{this.email}</strong>
                : <button className="btn sm" type="button" onClick={()=>this.setState({open: true})}>Reveal email</button>
          }
        </span>
    );
  }
}

ReactDOM.render(e(StoryButton), document.getElementById('story_btn'));
ReactDOM.render(
    <RevealEmail email="bthole at purchaseclinic_dotcom"></RevealEmail>, 
    document.getElementById('reveal_email_1'));
ReactDOM.render(
    <RevealEmail email="oz at jamm_dotdev"></RevealEmail>, 
    document.getElementById('reveal_email_2'));